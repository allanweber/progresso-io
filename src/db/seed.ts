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
import { and, eq } from "drizzle-orm";

config({ path: ".env.local" });
config();

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
  if (link.length === 0) {
    await db.insert(schema.students).values({
      clinicId: coachClinic.id,
      coachId: coach.id,
      userId: aluno.id,
      firstName: "Ana",
      lastName: "Aluna",
      email: alunoEmail,
      goal: "Hipertrofia",
      status: "active",
      modality: "online",
    });
    console.info("✓ linked aluno to coach");
  }

  console.info("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
