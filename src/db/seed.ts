/**
 * Seeds the coach / aluno / super-admin scenario, in one clinic:
 *   - a coach who owns a clinic,
 *   - an aluno who belongs to that same clinic and is linked to the coach,
 *   - a platform admin (no clinic).
 *
 * Run with: `npm run db:seed` (requires DATABASE_URL). Idempotent.
 *
 * Default credentials (override via env):
 *   COACH  coach@progresso.io  / progresso123
 *   ALUNO  aluno@progresso.io  / progresso123
 *   ADMIN  admin@progresso.io  / progresso123
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

import type {
  DietTree,
  TreeItem,
  TreeMacros,
  TreeMeal,
} from "@/lib/student-diets";

config({ path: ".env.local" });
config();

type DbModule = typeof import("@/db");

/** Scales per-100 g macros to `grams`. */
function scaleMacros(per100: TreeMacros, grams: number): TreeMacros {
  const s = (v: number | null) => (v === null ? null : (v * grams) / 100);
  return {
    energyKcal: s(per100.energyKcal),
    protein: s(per100.protein),
    carbohydrate: s(per100.carbohydrate),
    fat: s(per100.fat),
  };
}

/** Sums a list of macro rows (null + null stays null). */
function sumMacros(rows: TreeMacros[]): TreeMacros {
  const add = (a: number | null, b: number | null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  return rows.reduce<TreeMacros>(
    (acc, m) => ({
      energyKcal: add(acc.energyKcal, m.energyKcal),
      protein: add(acc.protein, m.protein),
      carbohydrate: add(acc.carbohydrate, m.carbohydrate),
      fat: add(acc.fat, m.fat),
    }),
    { energyKcal: null, protein: null, carbohydrate: null, fat: null },
  );
}

type SeedLine = {
  description: string;
  grams: number;
  per100: TreeMacros;
  measureLabel?: string | null;
  measureGrams?: number | null;
  substitutes?: Omit<SeedLine, "substitutes">[];
};

function buildLine(o: SeedLine): TreeItem {
  const line = (l: Omit<SeedLine, "substitutes">) => ({
    foodId: randomUUID(),
    description: l.description,
    code: null,
    origin: "base" as const,
    grams: l.grams,
    measureLabel: l.measureLabel ?? null,
    measureGrams: l.measureGrams ?? null,
    per100: l.per100,
    macros: scaleMacros(l.per100, l.grams),
  });
  return { ...line(o), substitutes: (o.substitutes ?? []).map(line) };
}

/** A realistic "Cutting" tree (café / almoço / pré-treino / ceia). */
function buildAlunoTree(): DietTree {
  const meals: TreeMeal[] = [
    {
      name: "Café da manhã",
      time: "08:00",
      items: [
        buildLine({
          description: "Pão, trigo, francês",
          grams: 100,
          measureLabel: "unidade",
          measureGrams: 50,
          per100: { energyKcal: 300, protein: 8, carbohydrate: 58, fat: 3 },
        }),
        buildLine({
          description: "Maçã, Fuji, com casca, crua",
          grams: 130,
          measureLabel: "unidade",
          measureGrams: 130,
          per100: {
            energyKcal: 56,
            protein: 0.2,
            carbohydrate: 15.6,
            fat: 0.1,
          },
          substitutes: [
            {
              description: "Banana, nanica, crua",
              grams: 79,
              per100: {
                energyKcal: 92,
                protein: 1.4,
                carbohydrate: 23.8,
                fat: 0.1,
              },
            },
          ],
        }),
      ],
      totals: { energyKcal: null, protein: null, carbohydrate: null, fat: null },
    },
    {
      name: "Almoço",
      time: "12:00",
      items: [
        buildLine({
          description: "Arroz, tipo 1, cozido",
          grams: 300,
          measureLabel: "colher de sopa",
          measureGrams: 25,
          per100: {
            energyKcal: 128,
            protein: 2.3,
            carbohydrate: 28.1,
            fat: 0.2,
          },
          substitutes: [
            {
              description: "Batata, doce, cozida",
              grams: 501,
              per100: {
                energyKcal: 77,
                protein: 0.6,
                carbohydrate: 18.4,
                fat: 0.1,
              },
            },
          ],
        }),
        buildLine({
          description: "Frango, peito, sem pele, cozido",
          grams: 200,
          measureLabel: "filé",
          measureGrams: 100,
          per100: {
            energyKcal: 163,
            protein: 31.5,
            carbohydrate: 0,
            fat: 3.2,
          },
        }),
      ],
      totals: { energyKcal: null, protein: null, carbohydrate: null, fat: null },
    },
    {
      name: "Ceia",
      time: null,
      items: [
        buildLine({
          description: "Iogurte, grego, natural, integral",
          grams: 170,
          measureLabel: "pote",
          measureGrams: 170,
          per100: {
            energyKcal: 97,
            protein: 9,
            carbohydrate: 4,
            fat: 5,
          },
        }),
      ],
      totals: { energyKcal: null, protein: null, carbohydrate: null, fat: null },
    },
  ];

  for (const meal of meals) {
    meal.totals = sumMacros(meal.items.map((i) => i.macros));
  }
  return {
    totals: sumMacros(meals.map((m) => m.totals)),
    meals,
  };
}

/**
 * Publishes a single active diet (v1) for the seeded aluno, if they don't have
 * one yet. The version stores a frozen snapshot, so this needs no food catalog.
 */
async function seedAlunoDiet(
  db: NonNullable<DbModule["db"]>,
  schema: DbModule["schema"],
  clinicId: string,
  studentId: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.studentDiet.id })
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, clinicId),
        eq(schema.studentDiet.studentId, studentId),
      ),
    );
  if (existing.length > 0) return;

  /** Inserts a diet + its single published v1. */
  async function publish(
    name: string,
    status: "active" | "archived",
    tree: DietTree,
    publishedAt: Date,
  ) {
    const [row] = await db
      .insert(schema.studentDiet)
      .values({ clinicId, studentId, name, status })
      .returning({ id: schema.studentDiet.id });
    await db.insert(schema.studentDietVersion).values({
      studentDietId: row.id,
      version: 1,
      status: "published",
      tree,
      notes: "Beber 3L de água por dia.",
      publishedAt,
    });
  }

  // An older, archived diet (shows under "Dietas anteriores"), then the active
  // one the aluno currently sees.
  await publish(
    "Adaptação",
    "archived",
    buildAlunoTree(),
    new Date("2026-07-01T12:00:00Z"),
  );
  await publish(
    "Cutting",
    "active",
    buildAlunoTree(),
    new Date("2026-08-08T12:00:00Z"),
  );
  console.info("✓ published aluno diets (Adaptação archived + Cutting v1)");
}

async function seed() {
  const { db, schema } = await import("@/db");
  const { createAuth } = await import("@/lib/auth");
  const { createClinicForOwner } = await import("@/server/dal/clinics");

  if (!db) throw new Error("DATABASE_URL is not set — cannot seed.");

  // Seed-local auth: no OTP e-mails, no Next.js cookies.
  const auth = createAuth({ nextCookiesPlugin: false, sendOtp: async () => {} });

  // Per-plan student caps (reference data). `null` = unlimited. Free blocks the
  // 4th student. Idempotent upsert so re-running keeps them in sync.
  const planLimits: { plan: (typeof schema.PLANS)[number]; maxStudents: number | null }[] = [
    { plan: "free", maxStudents: 3 },
    { plan: "solo", maxStudents: 50 },
    { plan: "clinica", maxStudents: 300 },
    { plan: "enterprise", maxStudents: null },
  ];
  for (const limit of planLimits) {
    await db
      .insert(schema.planLimit)
      .values(limit)
      .onConflictDoUpdate({
        target: schema.planLimit.plan,
        set: { maxStudents: limit.maxStudents },
      });
  }
  console.info("✓ plan limits seeded");
  const password = process.env.SEED_PASSWORD ?? "progresso123";
  const coachEmail = process.env.SEED_COACH_EMAIL ?? "coach@progresso.io";
  const alunoEmail = process.env.SEED_ALUNO_EMAIL ?? "aluno@progresso.io";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@progresso.io";

  /** Returns the user with this email, signing them up if they don't exist. */
  async function ensureUser(name: string, email: string) {
    const existing = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email));
    if (existing.length > 0) return existing[0];
    await auth.api.signUpEmail({ body: { name, email, password } });
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email));
    console.info(`✓ created ${email}`);
    return row;
  }

  // Coach — keeps the clinic auto-created for them at sign-up.
  const coach = await ensureUser("Thiago Coach", coachEmail);
  let [coachClinic] = await db
    .select()
    .from(schema.clinic)
    .where(eq(schema.clinic.ownerUserId, coach.id));
  if (!coachClinic) {
    coachClinic = await createClinicForOwner(db, {
      ownerUserId: coach.id,
      name: "Clínica de Thiago",
      plan: "solo",
    });
  }
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "coach", clinicId: coachClinic.id })
    .where(eq(schema.user.id, coach.id));
  // Give the demo coach a roomy plan so the seeded scenario isn't at the cap.
  await db
    .update(schema.clinic)
    .set({ plan: "clinica" })
    .where(eq(schema.clinic.id, coachClinic.id));

  // Aluno — belongs to the coach's clinic; drop the clinic auto-created for them.
  const aluno = await ensureUser("Ana Aluna", alunoEmail);
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "aluno", clinicId: coachClinic.id })
    .where(eq(schema.user.id, aluno.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, aluno.id));

  // Admin — platform admin, no clinic.
  const admin = await ensureUser("Super Admin", adminEmail);
  await db
    .update(schema.user)
    .set({ emailVerified: true, role: "admin", clinicId: null })
    .where(eq(schema.user.id, admin.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, admin.id));

  // Link the aluno to the coach inside the clinic.
  const link = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, coachClinic.id),
        eq(schema.students.email, alunoEmail),
      ),
    );
  let studentId = link[0]?.id;
  if (!studentId) {
    const [row] = await db
      .insert(schema.students)
      .values({
        clinicId: coachClinic.id,
        coachId: coach.id,
        userId: aluno.id,
        firstName: "Ana",
        lastName: "Aluna",
        email: alunoEmail,
        goal: "Hipertrofia",
        status: "active",
        modality: "online",
      })
      .returning({ id: schema.students.id });
    studentId = row.id;
    console.info("✓ linked aluno to coach");
  }

  // A published diet for the aluno, so the /student portal has something to
  // show. The version stores a self-contained snapshot (DietTree) — no catalog
  // food rows required — mirroring how a real publish freezes the tree.
  await seedAlunoDiet(db, schema, coachClinic.id, studentId);

  console.info("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
