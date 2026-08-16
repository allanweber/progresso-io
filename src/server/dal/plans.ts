import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Plan } from "@/db/schema";
import { schema } from "@/db";
import {
  PLAN_DEFAULT_ARCHIVE,
  PLAN_DEFAULT_CALENDAR,
  TRIAL_PLAN,
} from "@/lib/plans";
import type { TenantContext } from "@/server/tenant";

/**
 * Plan-limit lookups. `plan_limit` is reference data (not tenant-scoped) keyed
 * by the lowercase plan name, so caps + capabilities live in the database rather
 * than in code. The clinic's plan is read for the current tenant, so everything
 * returned is still derived from the session, never from client input.
 *
 * **Trial.** A clinic on `free` with `trial_ends_at` in the future resolves to
 * {@link TRIAL_PLAN} (Solo) limits — the cap goes to 50 so a coach can move a
 * real roster in during the trial. The stored `plan` is never mutated, so
 * expiry is a pure date comparison that stays correct even if no cron ever
 * runs, and `clinic_plan_change` keeps auditing only real plan changes.
 * Expiry is **non-destructive**: the cap drops back to 3 but the student cap is
 * only checked when *creating* a student, so alunos added during the trial stay
 * active and their portals keep working.
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
  /** Whether the plan may use the coach Calendar/Agenda (Free excluded). */
  calendar: boolean;
  /** The clinic's stored plan — what it actually pays for. */
  plan: Plan;
  /** The plan these limits came from: `TRIAL_PLAN` while a trial is running. */
  effectivePlan: Plan;
  /** Whether a trial is running right now (free plan + future `trialEndsAt`). */
  trialActive: boolean;
  /** End of the trial window, whether or not it has already passed. */
  trialEndsAt: Date | null;
};

/**
 * The trial plan's row, joined alongside the clinic's own so a single query can
 * serve either — which one applies is decided below, in plain TypeScript.
 */
const trialLimit = alias(schema.planLimit, "trial_limit");

/** A trial applies only to a clinic still on `free`, and only until it ends. */
function isTrialActive(plan: Plan, trialEndsAt: Date | null, now: Date) {
  return plan === "free" && trialEndsAt !== null && trialEndsAt > now;
}

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
      trialEndsAt: schema.clinic.trialEndsAt,
      planMaxStudents: schema.planLimit.maxStudents,
      planMaxCoaches: schema.planLimit.maxCoaches,
      planWhatsapp: schema.planLimit.whatsapp,
      planArchive: schema.planLimit.archive,
      planCalendar: schema.planLimit.calendar,
      trialMaxStudents: trialLimit.maxStudents,
      trialMaxCoaches: trialLimit.maxCoaches,
      trialWhatsapp: trialLimit.whatsapp,
      trialArchive: trialLimit.archive,
      trialCalendar: trialLimit.calendar,
      overStudents: schema.clinic.maxStudentsOverride,
      overCoaches: schema.clinic.maxCoachesOverride,
      overWhatsapp: schema.clinic.whatsappOverride,
      overArchive: schema.clinic.archiveOverride,
      overCalendar: schema.clinic.calendarOverride,
    })
    .from(schema.clinic)
    .leftJoin(schema.planLimit, eq(schema.planLimit.plan, schema.clinic.plan))
    // The trial plan's limits ride along on every lookup so the branch below is
    // a plain choice between two already-loaded rows — one query either way.
    .leftJoin(trialLimit, eq(trialLimit.plan, TRIAL_PLAN))
    .where(eq(schema.clinic.id, ctx.clinicId));

  const plan = row?.plan ?? "free";
  const trialEndsAt = row?.trialEndsAt ?? null;
  const trialActive = isTrialActive(plan, trialEndsAt, new Date());
  const effectivePlan = trialActive ? TRIAL_PLAN : plan;

  // The plan_limit row the caps come from: the trial plan's while a trial runs,
  // the clinic's own otherwise. Per-clinic overrides still win over both — an
  // admin who capped a clinic meant it, trial or not.
  const limit = trialActive
    ? {
        maxStudents: row?.trialMaxStudents,
        maxCoaches: row?.trialMaxCoaches,
        whatsapp: row?.trialWhatsapp,
        archive: row?.trialArchive,
        calendar: row?.trialCalendar,
      }
    : {
        maxStudents: row?.planMaxStudents,
        maxCoaches: row?.planMaxCoaches,
        whatsapp: row?.planWhatsapp,
        archive: row?.planArchive,
        calendar: row?.planCalendar,
      };

  // A missing plan_limit row (`archive`/`calendar` null) falls back to the
  // default of the EFFECTIVE plan, to match the row picked above.
  const archiveFallback = row ? PLAN_DEFAULT_ARCHIVE[effectivePlan] : true;
  const calendarFallback = row ? PLAN_DEFAULT_CALENDAR[effectivePlan] : true;

  return {
    maxStudents: row?.overStudents ?? limit.maxStudents ?? null,
    maxCoaches: row?.overCoaches ?? limit.maxCoaches ?? null,
    whatsapp: row?.overWhatsapp ?? limit.whatsapp ?? true,
    archive: row?.overArchive ?? limit.archive ?? archiveFallback,
    calendar: row?.overCalendar ?? limit.calendar ?? calendarFallback,
    plan,
    effectivePlan,
    trialActive,
    trialEndsAt,
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

/**
 * Whether the current clinic may use the coach Calendar/Agenda. Free clinics are
 * excluded; every paid plan (and a missing row) may use it.
 */
export async function canUseCalendar(ctx: TenantContext): Promise<boolean> {
  return (await getPlanLimits(ctx)).calendar;
}
