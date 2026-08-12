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
    price: "R$ 199",
    popular: true,
  },
  clinica: {
    id: "clinica",
    name: "Clínica",
    desc: "Até 100 alunos + 3 coaches",
    price: "R$ 399",
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
 * it is not self-selectable (it never appears here).
 */
export const SIGNUP_PLANS: PlanMeta[] = [
  PLAN_META.free,
  PLAN_META.solo,
  PLAN_META.clinica,
];

/** A used/limit pair, `limit: null` meaning unlimited. */
export type UsageCounter = { used: number; limit: number | null };

/**
 * The clinic's plan usage vs. its caps, read by the "Plano atual" card, the
 * roster chip and the dashboard tile. `limit: null` = unlimited.
 */
export type PlanUsageDto = {
  plan: Plan;
  planName: string;
  students: UsageCounter;
  coaches: UsageCounter;
  whatsapp: boolean;
};

/** "34 / 50", or just "34" when the cap is unlimited. */
export function formatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used}` : `${used} / ${limit}`;
}

/** Whether usage has reached (or passed) the cap — for an "at limit" accent. */
export function isAtLimit(used: number, limit: number | null): boolean {
  return limit !== null && used >= limit;
}
