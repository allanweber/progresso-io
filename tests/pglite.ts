import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
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
