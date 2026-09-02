import type { Plan } from "@/db/schema";

/**
 * Client-safe plan catalog: PT-BR name, description and price per subscription
 * plan. Shared by the sign-up wizard (self-selectable plans) and the clinic
 * settings screen's "Plano atual" card, which reads the clinic's real plan.
 * Only an erased `import type` from the schema, so it bundles into client code.
 */

export type PlanMeta = {
  id: Plan;
  name: string;
  desc: string;
  price: string;
  /** Highlighted as the recommended option in the sign-up wizard. */
  popular?: boolean;
};

export const PLAN_META: Record<Plan, PlanMeta> = {
  free: { id: "free", name: "Free", desc: "Até 3 alunos", price: "R$ 0" },
  solo: {
    id: "solo",
    name: "Solo",
    desc: "Até 50 alunos + WhatsApp",
    price: "R$ 179",
    popular: true,
  },
  clinica: {
    id: "clinica",
    name: "Clínica",
    desc: "Até 100 alunos + 3 coaches",
    price: "R$ 379",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    desc: "Sob medida para grandes operações",
    price: "Sob consulta",
  },
};

/**
 * Plans a coach can pick during sign-up. Enterprise is a "contact us" plan, so
 * it is not self-selectable (it never appears here). `SIGNUP_PLAN_IDS` is the
 * server-side allow-list the sign-up action validates the submitted plan against
 * — a coach can only self-select one of these, never `enterprise`.
 */
export const SIGNUP_PLAN_IDS = ["free", "solo", "clinica"] as const;

export const SIGNUP_PLANS: PlanMeta[] = SIGNUP_PLAN_IDS.map(
  (id) => PLAN_META[id],
);

/**
 * Whether each plan may archive (soft-remove) students. Free/Solo can't — they
 * hard-delete instead. Used as the fallback when a `plan_limit` row is missing.
 */
export const PLAN_DEFAULT_ARCHIVE: Record<Plan, boolean> = {
  free: false,
  solo: false,
  clinica: true,
  enterprise: true,
};

/**
 * Whether each plan gets the coach Calendar/Agenda. Free is excluded; every paid
 * plan gets it. Used as the fallback when a `plan_limit` row is missing.
 */
export const PLAN_DEFAULT_CALENDAR: Record<Plan, boolean> = {
  free: false,
  solo: true,
  clinica: true,
  enterprise: true,
};

/**
 * AI program generations included per calendar month. `null` = unlimited. Used
 * as the fallback when a `plan_limit` row is missing.
 *
 * Free gets **1**: enough to prove the quality, and immediately insufficient —
 * which is the whole job of a free tier on the flagship feature. One credit buys
 * a workout *or* a diet, since each is its own model call.
 */
export const PLAN_DEFAULT_AI_GENERATIONS: Record<Plan, number | null> = {
  free: 1,
  solo: 10,
  clinica: 25,
  enterprise: null,
};

/**
 * Trial: length, and the **default** plan whose limits a trialing clinic gets.
 *
 * Advertised at `/register` as "14 dias grátis, sem cartão", so these two must
 * stay in step with that copy. Solo is the conversion target and the floor every
 * trial gets; a coach who explicitly picked Clínica at sign-up trials Clínica
 * instead — see {@link trialPlanFor}, which is what the limits lookup resolves.
 */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN = "solo" satisfies Plan;

/**
 * The plan a trialing clinic is granted, given the plan it picked at sign-up
 * (`clinic.intended_plan`).
 *
 * A coach who picked **Clínica** trials Clínica — otherwise the two things that
 * plan is bought for (a shared team and a branded Portal do aluno) would be
 * invisible for the whole evaluation window, including in the setup guide that
 * offers to configure them. Everyone else trials {@link TRIAL_PLAN} (Solo), the
 * conversion target, which is also what a Free pick got before this existed —
 * so no sign-up ever trials *less* than it used to.
 *
 * Never returns `enterprise`: it isn't self-selectable at sign-up, and an
 * unknown/absent intent falls back to Solo.
 */
export function trialPlanFor(intendedPlan: Plan | null): Plan {
  return intendedPlan === "clinica" ? "clinica" : TRIAL_PLAN;
}

/**
 * The plan whose capabilities a clinic actually has right now: the trial's while
 * one is running, the clinic's own otherwise. The single definition of
 * "effective plan" — the limits lookup, the AI sweep and every branded-portal
 * gate resolve it identically, so a coach can never be told they have a feature
 * on one screen and refused it on another.
 */
export function effectivePlanOf(
  clinic: { plan: Plan; intendedPlan: Plan | null; trialEndsAt: Date | null },
  now: Date,
): Plan {
  return isTrialActive(clinic.plan, clinic.trialEndsAt, now)
    ? trialPlanFor(clinic.intendedPlan)
    : clinic.plan;
}

/**
 * A trial applies only to a clinic still on `free`, and only until it ends.
 *
 * Pure so both the per-tenant lookup (`getPlanLimits`) and the cross-tenant
 * admin sweep decide it identically — an admin screen that disagreed with the
 * coach's own credit counter would be worse than no screen.
 */
export function isTrialActive(
  plan: Plan,
  trialEndsAt: Date | null,
  now: Date,
): boolean {
  return plan === "free" && trialEndsAt !== null && trialEndsAt > now;
}

/**
 * The effective AI allowance for one clinic: per-clinic override wins, else the
 * `plan_limit` row, else the plan's coded default. `null` = unlimited.
 *
 * `rowPresent` is not redundant with `rowValue`: `ai_generations` is nullable on
 * purpose (Enterprise is uncapped), so a null value alone cannot tell
 * "unlimited" from "no row at all". Absent a row this falls back to the coded
 * default rather than to unlimited — every generation is a paid model call, so
 * this one inverts the usual "a missing limit must never block" rule.
 */
export function resolveAiGenerations(args: {
  override: number | null;
  rowPresent: boolean;
  rowValue: number | null;
  effectivePlan: Plan;
}): number | null {
  if (args.override !== null) return args.override;
  return args.rowPresent
    ? args.rowValue
    : PLAN_DEFAULT_AI_GENERATIONS[args.effectivePlan];
}

/** The end of a trial starting now — used when a clinic is created. */
export function trialEndsAtFrom(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return end;
}

/**
 * Whole days left in the trial, rounded **up** so a trial ending in 6 hours
 * still reads "1 dia" rather than "0". `0` means it has run out.
 */
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** "1 dia restante" / "5 dias restantes" — PT-BR, singular-aware. */
export function formatTrialDaysLeft(days: number): string {
  return days === 1 ? "1 dia restante" : `${days} dias restantes`;
}

/** A used/limit pair, `limit: null` meaning unlimited. */
export type UsageCounter = { used: number; limit: number | null };

/**
 * The clinic's plan usage vs. its caps, read by the "Plano atual" card, the
 * roster chip and the dashboard tile. `limit: null` = unlimited.
 */
export type PlanUsageDto = {
  plan: Plan;
  planName: string;
  /** The plan the limits came from — `TRIAL_PLAN` while a trial is running. */
  effectivePlan: Plan;
  students: UsageCounter;
  coaches: UsageCounter;
  /**
   * AI generations used this calendar month vs. the plan's allowance. Unlike
   * students/coaches this one *resets*: it counts `ai_generation` rows since the
   * 1st (America/São_Paulo), not live objects.
   */
  ai: UsageCounter;
  whatsapp: boolean;
  /** Whether the clinic may archive students (else hard-delete only). */
  archive: boolean;
  trial: TrialDto;
  /**
   * The invoice the coach still owes, if any — the oldest unpaid one, so the
   * banner nags about the longest-overdue first. `null` when nothing is due.
   * Collection is manual (roadmap item 0 Phase 1): the platform admin issues
   * and settles it, this is read-only for the coach.
   */
  openInvoice: OpenInvoiceDto | null;
};

/** Trial state for the billing banner. */
export type TrialDto = {
  /** A trial is running right now. */
  active: boolean;
  /** ISO timestamp, whether or not it has already passed. `null` = no trial. */
  endsAt: string | null;
  /** Whole days left, rounded up. `0` once it has run out. */
  daysLeft: number;
  /** The trial ran and is over, and the clinic never upgraded. */
  expired: boolean;
};

/** The minimum an unpaid invoice needs for the banner. */
export type OpenInvoiceDto = {
  id: string;
  number: number;
  dueDate: string;
  totalCents: number;
  overdue: boolean;
};

/** "34 / 50", or just "34" when the cap is unlimited. */
export function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used}` : `${used} / ${limit}`;
}

/** Whether usage has reached (or passed) the cap — for an "at limit" accent. */
export function isAtLimit(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}
