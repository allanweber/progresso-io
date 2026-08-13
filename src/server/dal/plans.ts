import { eq } from "drizzle-orm";

import { schema } from "@/db";
import { PLAN_DEFAULT_ARCHIVE } from "@/lib/plans";
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
  /** Whether the plan may archive (soft-remove) students. */
  archive: boolean;
};

/**
 * The current clinic's effective plan capabilities: the plan defaults
 * (`plan_limit`) with any per-clinic override applied on top. A `null` override
 * column means "inherit the plan"; a set value wins for this clinic only. A
 * missing `plan_limit` row must never block — caps fall back to unlimited and
 * WhatsApp stays enabled (paid default). Left join, so an override still resolves
 * even if the plan row is absent.
 */
export async function getPlanLimits(ctx: TenantContext): Promise<PlanLimits> {
  const [row] = await ctx.db
    .select({
      plan: schema.clinic.plan,
      planMaxStudents: schema.planLimit.maxStudents,
      planMaxCoaches: schema.planLimit.maxCoaches,
      planWhatsapp: schema.planLimit.whatsapp,
      planArchive: schema.planLimit.archive,
      overStudents: schema.clinic.maxStudentsOverride,
      overCoaches: schema.clinic.maxCoachesOverride,
      overWhatsapp: schema.clinic.whatsappOverride,
      overArchive: schema.clinic.archiveOverride,
    })
    .from(schema.clinic)
    .leftJoin(schema.planLimit, eq(schema.planLimit.plan, schema.clinic.plan))
    .where(eq(schema.clinic.id, ctx.clinicId));

  // A missing plan_limit row (`planArchive` null) falls back to the plan default.
  const archiveFallback = row ? PLAN_DEFAULT_ARCHIVE[row.plan] : true;

  return {
    maxStudents: row?.overStudents ?? row?.planMaxStudents ?? null,
    maxCoaches: row?.overCoaches ?? row?.planMaxCoaches ?? null,
    whatsapp: row?.overWhatsapp ?? row?.planWhatsapp ?? true,
    archive: row?.overArchive ?? row?.planArchive ?? archiveFallback,
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

/**
 * Whether the current clinic may ARCHIVE (soft-remove) students. Free/Solo can't
 * — they hard-delete instead.
 */
export async function canArchiveStudents(ctx: TenantContext): Promise<boolean> {
  return (await getPlanLimits(ctx)).archive;
}
