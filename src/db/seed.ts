/**
 * Seeds one user of each role so the coach / aluno / super-admin scenario can
 * be exercised end to end.
 *
 * Run with: `npm run db:seed` (requires DATABASE_URL). Idempotent — existing
 * users are left untouched.
 *
 * Default credentials (override via env):
 *   COACH  coach@progresso.io  / progresso123
 *   ALUNO  aluno@progresso.io  / progresso123
 *   ADMIN  admin@progresso.io  / progresso123
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import type { Role } from "@/lib/roles";

config({ path: ".env.local" });
config();

async function seed() {
  const { db, schema } = await import("@/db");
  const { createAuth } = await import("@/lib/auth");

  if (!db) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }

  // A seed-local auth instance that doesn't try to send OTP e-mails or flush
  // Next.js cookies.
  const auth = createAuth({ nextCookiesPlugin: false, sendOtp: async () => {} });
  const password = process.env.SEED_PASSWORD ?? "progresso123";

  const people: Array<{ name: string; email: string; role: Role }> = [
    { name: "Thiago Coach", email: process.env.SEED_COACH_EMAIL ?? "coach@progresso.io", role: "coach" },
    { name: "Ana Aluna", email: process.env.SEED_ALUNO_EMAIL ?? "aluno@progresso.io", role: "aluno" },
    { name: "Super Admin", email: process.env.SEED_ADMIN_EMAIL ?? "admin@progresso.io", role: "admin" },
  ];

  const created: Record<string, string> = {};

  for (const person of people) {
    const existing = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, person.email));

    if (existing.length > 0) {
      created[person.role] = existing[0].id;
      console.info(`• ${person.role} already exists: ${person.email}`);
      continue;
    }

    await auth.api.signUpEmail({
      body: { name: person.name, email: person.email, password },
    });

    // Mark verified and apply the intended role (sign-up always defaults to coach).
    const [row] = await db
      .update(schema.user)
      .set({ emailVerified: true, role: person.role })
      .where(eq(schema.user.email, person.email))
      .returning();

    created[person.role] = row.id;
    console.info(`✓ created ${person.role}: ${person.email}`);
  }

  // Link the aluno to the coach so the relationship is populated.
  if (created.coach && created.aluno) {
    const link = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.userId, created.aluno));

    if (link.length === 0) {
      await db.insert(schema.students).values({
        coachId: created.coach,
        userId: created.aluno,
        name: "Ana Aluna",
        email: process.env.SEED_ALUNO_EMAIL ?? "aluno@progresso.io",
      });
      console.info("✓ linked aluno to coach");
    }
  }

  console.info("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
