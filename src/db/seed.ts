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
import { config } from "dotenv";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { DietWriteInput } from "@/server/dal/diets";
import type { TenantContext } from "@/server/tenant";

config({ path: ".env.local" });
config();

type DbModule = typeof import("@/db");
type StudentDietsDal = typeof import("@/server/dal")["studentDiets"];

/**
 * Publishes two diets for the seeded aluno (an archived "Adaptação" + the active
 * "Cutting") via the real DAL, referencing **real catalog foods** by description.
 * Nutrition and catalog substitutions are derived live on read, so this needs no
 * hand-authored macros. Idempotent: skips if the student already has a diet.
 */
async function seedAlunoDiet(
  db: NonNullable<DbModule["db"]>,
  schema: DbModule["schema"],
  studentDiets: StudentDietsDal,
  ctx: TenantContext,
  studentId: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.studentDiet.id })
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
      ),
    );
  if (existing.length > 0) return;

  /** First non-archived base food whose description matches (shortest wins). */
  async function food(like: string): Promise<string | null> {
    const [row] = await db
      .select({ id: schema.food.id })
      .from(schema.food)
      .where(
        and(
          isNull(schema.food.clinicId),
          eq(schema.food.archived, false),
          sql`${schema.food.description} ILIKE ${like}`,
        ),
      )
      .orderBy(sql`char_length(${schema.food.description})`)
      .limit(1);
    return row?.id ?? null;
  }

  const [arroz, frango, pao, ovo, maca, iogurte, banana, batata, feijao] =
    await Promise.all([
      food("%arroz%cozido%"),
      food("%frango%peito%"),
      food("%pão%franc%"),
      food("%ovo%cozido%"),
      food("%maçã%"),
      food("%iogurte%"),
      food("%banana%"),
      food("%batata%doce%cozida%"),
      food("%feijão%carioca%cozido%"),
    ]);

  /** Ensures a base catalog substitution exists, so the demo shows swaps live. */
  async function ensureSub(foodId: string | null, subId: string | null, grams: number) {
    if (!foodId || !subId) return;
    const [ex] = await db
      .select({ id: schema.foodSubstitution.id })
      .from(schema.foodSubstitution)
      .where(
        and(
          isNull(schema.foodSubstitution.clinicId),
          eq(schema.foodSubstitution.foodId, foodId),
          eq(schema.foodSubstitution.substituteFoodId, subId),
        ),
      );
    if (!ex) {
      await db
        .insert(schema.foodSubstitution)
        .values({ clinicId: null, foodId, substituteFoodId: subId, grams });
    }
  }
  await ensureSub(arroz, batata, 167);
  await ensureSub(arroz, feijao, 120);
  await ensureSub(frango, ovo, 148);

  const item = (foodId: string | null, grams: number) =>
    foodId ? { foodId, grams, substitutes: [] } : null;

  const cutting: DietWriteInput = {
    name: "Cutting",
    notes: "Beber 3L de água por dia.",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [item(pao, 100), item(ovo, 100), item(maca, 130)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Almoço",
        time: "12:00",
        items: [item(arroz, 250), item(frango, 170)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Ceia",
        time: null,
        items: [item(iogurte, 170)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
    ],
  };
  const adaptacao: DietWriteInput = {
    name: "Adaptação",
    notes: "Fase inicial.",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [item(pao, 50), item(banana, 100)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
      {
        name: "Almoço",
        time: "12:00",
        items: [item(arroz, 200), item(frango, 150)].filter(
          (i): i is NonNullable<typeof i> => i !== null,
        ),
      },
    ],
  };

  const hasItems = (d: DietWriteInput) => d.meals.some((m) => m.items.length > 0);
  if (!hasItems(cutting)) {
    console.info("• skipped aluno diet — no matching catalog foods");
    return;
  }

  // Publish "Adaptação" first (becomes active), then "Cutting" as a new diet —
  // its first publish archives "Adaptação" and becomes the active one.
  if (hasItems(adaptacao)) {
    await studentDiets.createBlankDraft(ctx, studentId, adaptacao.name);
    await studentDiets.publishDraft(ctx, studentId, adaptacao);
  }
  await studentDiets.createBlankDraft(ctx, studentId, cutting.name);
  await studentDiets.publishDraft(ctx, studentId, cutting);
  console.info("✓ published aluno diets (Adaptação archived + Cutting active)");
}

async function seed() {
  const { db, schema } = await import("@/db");
  const { createAuth } = await import("@/lib/auth");
  const { createClinicForOwner } = await import("@/server/dal/clinics");
  const { studentDiets } = await import("@/server/dal");

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
  const coachCtx: TenantContext = {
    db,
    clinicId: coachClinic.id,
    userId: coach.id,
    role: "coach",
  };
  await seedAlunoDiet(db, schema, studentDiets, coachCtx, studentId);

  console.info("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
