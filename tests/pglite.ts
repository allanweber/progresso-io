import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

/**
 * A fresh in-memory Postgres (PGlite) with every Drizzle migration applied and
 * the `pg_trgm` / `unaccent` extensions loaded — the food-catalog migration
 * creates them and builds a trigram index, so they must be available for the
 * migration SQL to run. Shared by the integration tests so they exercise the
 * real migration files rather than a hand-built schema.
 */
export async function createTestDb() {
  const client = new PGlite({ extensions: { pg_trgm, unaccent } });
  const dir = join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await client.exec(readFileSync(join(dir, file), "utf8"));
  }
  return drizzle(client, { schema, casing: "snake_case" });
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * Clears the sign-up trial on a clinic, so its **stored plan** is what governs.
 *
 * Every clinic created through the real sign-up path gets the 14-day trial,
 * which resolves to Solo limits while it runs (see `getPlanLimits`). Tests that
 * assert plan gates and caps are about the plan, not the trial — they call this
 * to put the clinic in the post-trial state. Trial behaviour itself is covered
 * in `tests/trial.integration.test.ts`.
 */
export async function clearTrial(db: TestDb, clinicId: string) {
  await db
    .update(schema.clinic)
    .set({ trialEndsAt: null })
    .where(eq(schema.clinic.id, clinicId));
}
