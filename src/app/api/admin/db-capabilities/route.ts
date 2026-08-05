import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * TEMPORARY diagnostic — confirms the Postgres role can create the `pg_trgm` /
 * `unaccent` extensions the food-catalog search will need, without a shell on
 * the server (open it in the browser as a super admin).
 *
 * Admin-only and non-destructive: the read queries below only inspect catalogs,
 * and the definitive `CREATE EXTENSION` test runs inside a transaction that is
 * ALWAYS rolled back, so nothing is actually installed. Delete this route once
 * the capability is confirmed.
 */
export const GET = withRoute("admin.db_capabilities", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  // Read-only facts.
  const version = await db.execute(sql`show server_version`);
  const priv = await db.execute(
    sql`select current_user as role,
               has_database_privilege(current_user, current_database(), 'CREATE') as can_create`,
  );
  const extensions = await db.execute(
    sql`select name, default_version, installed_version
          from pg_available_extensions
         where name in ('pg_trgm', 'unaccent')
         order by name`,
  );

  // Definitive, non-destructive test: create the extensions inside a
  // transaction, then force a rollback by throwing a sentinel — so a success
  // proves the permission without leaving anything installed.
  class Rollback extends Error {}
  let dryRun: { ok: boolean; error?: string };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`create extension if not exists pg_trgm`);
      await tx.execute(sql`create extension if not exists unaccent`);
      throw new Rollback();
    });
    dryRun = { ok: true }; // unreachable: the transaction always throws.
  } catch (error) {
    dryRun =
      error instanceof Rollback
        ? { ok: true }
        : {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
  }

  return NextResponse.json({
    serverVersion: version[0]?.server_version ?? null,
    role: priv[0]?.role ?? null,
    canCreate: priv[0]?.can_create ?? null,
    extensions: Array.from(extensions),
    dryRun,
  });
});
