import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");
const CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "pglite");

/** The migration files, in the order Postgres must replay them. */
function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }));
}

/**
 * Snapshot key. Hashing the migration *contents* (not just the file list) means
 * editing a migration in place invalidates the cache — otherwise a stale
 * snapshot would keep tests passing against a schema that no longer exists.
 */
function snapshotPath(files: ReturnType<typeof migrationFiles>) {
  const h = createHash("sha256");
  for (const f of files) h.update(f.name).update("\0").update(f.sql).update("\0");
  return join(CACHE_DIR, `${h.digest("hex").slice(0, 16)}.tar`);
}

/**
 * A fresh in-memory Postgres (PGlite) with every Drizzle migration applied and
 * the `pg_trgm` / `unaccent` extensions loaded — the food-catalog migration
 * creates them and builds a trigram index, so they must be available for the
 * migration SQL to run. Shared by the integration tests so they exercise the
 * real migration files rather than a hand-built schema.
 *
 * Replaying every migration takes seconds, and each integration file calls this
 * in its own `beforeAll`, so the naive version cost the suite one full replay
 * per file. The first call now dumps the migrated data dir to
 * `node_modules/.cache/pglite/<hash>.tar` and every later call boots from that
 * snapshot instead. The database is still per-caller and in-memory — only the
 * *schema build* is shared, so tests stay isolated from each other.
 */
export async function createTestDb() {
  const files = migrationFiles();
  const snapshot = snapshotPath(files);

  if (existsSync(snapshot)) {
    const client = new PGlite({
      extensions: { pg_trgm, unaccent },
      loadDataDir: new Blob([readFileSync(snapshot)]),
    });
    await client.waitReady;
    return drizzle(client, { schema, casing: "snake_case" });
  }

  const client = new PGlite({ extensions: { pg_trgm, unaccent } });
  for (const file of files) await client.exec(file.sql);

  // Uncompressed: the tar is a few MB and lives under node_modules, and gzip
  // would cost more per boot than the disk read it saves.
  const dump = await client.dumpDataDir("none");
  mkdirSync(CACHE_DIR, { recursive: true });
  // Write-then-rename so a crash mid-dump can't leave a truncated snapshot that
  // every subsequent run would happily boot from.
  const tmp = `${snapshot}.${process.pid}.tmp`;
  writeFileSync(tmp, Buffer.from(await dump.arrayBuffer()));
  renameSync(tmp, snapshot);

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
