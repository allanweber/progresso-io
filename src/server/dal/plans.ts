import { eq } from "drizzle-orm";

import { schema } from "@/db";
import type { TenantContext } from "@/server/tenant";

/**
 * Plan-limit lookups. `plan_limit` is reference data (not tenant-scoped) keyed
 * by the lowercase plan name, so caps + capabilities live in the database rather
 * than in code. The clinic's plan is read for the current tenant, so everything
 * returned is still derived from the session, never from client input.
 */

/** The plan capabilities for the current clinic's plan. */
export type PlanLimits = {
  /** Max active students. `null` = unlimited. */
  maxStudents: number | null;
  /** Max coaches (incl. the owner). `null` = unlimited. */
  maxCoaches: number | null;
  /** Whether the plan may deliver over WhatsApp. */
  whatsapp: boolean;
};

/**
 * The current clinic's plan capabilities. A missing `plan_limit` row must never
 * block: caps fall back to unlimited and WhatsApp stays enabled (paid default).
 */
export async function getPlanLimits(ctx: TenantContext): Promise<PlanLimits> {
  const [row] = await ctx.db
    .select({
      maxStudents: schema.planLimit.maxStudents,
      maxCoaches: schema.planLimit.maxCoaches,
      whatsapp: schema.planLimit.whatsapp,
    })
    .from(schema.clinic)
    .innerJoin(schema.planLimit, eq(schema.planLimit.plan, schema.clinic.plan))
    .where(eq(schema.clinic.id, ctx.clinicId));

  return {
    maxStudents: row?.maxStudents ?? null,
    maxCoaches: row?.maxCoaches ?? null,
    whatsapp: row?.whatsapp ?? true,
  };
}

/**
 * The student cap for the current clinic's plan. `null` means unlimited — both
 * when the plan is explicitly uncapped and when no `plan_limit` row exists
 * (a missing limit must never block adding students).
 */
export async function getStudentLimit(ctx: TenantContext): Promise<number | null> {
  return (await getPlanLimits(ctx)).maxStudents;
}

/** The coach cap for the current clinic's plan. `null` means unlimited. */
export async function getCoachLimit(ctx: TenantContext): Promise<number | null> {
  return (await getPlanLimits(ctx)).maxCoaches;
}

/**
 * Whether the current clinic's plan may send over WhatsApp. Free clinics are
 * e-mail only; every paid plan (and a missing row) may use WhatsApp.
 */
export async function canUseWhatsapp(ctx: TenantContext): Promise<boolean> {
  return (await getPlanLimits(ctx)).whatsapp;
}
