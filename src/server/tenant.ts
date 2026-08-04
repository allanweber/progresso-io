import { redirect } from "next/navigation";

import { db, type DB } from "@/db";
import type { Role } from "@/db/schema";
import { requireSession } from "@/lib/session";

/**
 * Everything the Data Access Layer needs to run a tenant-scoped query. The
 * `clinicId` is derived from the authenticated session — NEVER from client
 * input — so a request can only ever touch its own clinic's data.
 */
export type TenantContext = {
  db: DB;
  clinicId: string;
  userId: string;
  role: Role;
};

/**
 * Returns the tenant context for the current request, redirecting to /login if
 * the user isn't signed in or has no clinic (e.g. a platform admin, who works
 * outside any tenant and must not reach clinic-scoped pages).
 */
export async function requireClinic(): Promise<TenantContext> {
  const session = await requireSession();
  const clinicId = session.user.clinicId;
  if (!clinicId) redirect("/login");
  return {
    db,
    clinicId,
    userId: session.user.id,
    role: session.user.role as Role,
  };
}
