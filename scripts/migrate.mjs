// Applies the Drizzle SQL migrations in ./drizzle to DATABASE_URL, then exits.
// Uses drizzle-orm's programmatic migrator (no drizzle-kit needed at runtime).
// Idempotent: already-applied migrations are tracked and skipped.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations applied.");
} catch (error) {
  console.error("✗ Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
