import { eq } from "drizzle-orm";

import { schema } from "@/db";
import type { TenantContext } from "@/server/tenant";

/**
 * Plan-limit lookups. `plan_limit` is reference data (not tenant-scoped) keyed
 * by the lowercase plan name, so caps live in the database rather than in code.
 * The clinic's plan is read for the current tenant, so the limit returned is
 * still derived from the session, never from client input.
 */

/**
 * The student cap for the current clinic's plan. `null` means unlimited — both
 * when the plan is explicitly uncapped and when no `plan_limit` row exists
 * (a missing limit must never block adding students).
 */
export async function getStudentLimit(ctx: TenantContext): Promise<number | null> {
  const [row] = await ctx.db
    .select({ maxStudents: schema.planLimit.maxStudents })
    .from(schema.clinic)
    .innerJoin(schema.planLimit, eq(schema.planLimit.plan, schema.clinic.plan))
    .where(eq(schema.clinic.id, ctx.clinicId));
  return row?.maxStudents ?? null;
}
