import { and, count, desc, eq, gte, inArray } from "drizzle-orm";

import type { AiGenerationKind, Plan } from "@/db/schema";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { LlmUsage } from "@/lib/llm-provider";
import { TRIAL_PLAN, isTrialActive, resolveAiGenerations } from "@/lib/plans";
import type { TenantContext } from "@/server/tenant";

/**
 * AI generation accounting. Every row is tenant-scoped by `ctx.clinicId`.
 *
 * `ai_generation` is the quota meter and the usage ledger at once — the monthly
 * cap is a count of rows, never a stored counter, so nothing needs resetting and
 * nothing can drift out of step with reality.
 *
 * The lifecycle is deliberately two-phase:
 *
 *  1. {@link startGeneration} writes a `pending` row **before** the model call.
 *  2. {@link finishGeneration} / {@link failGeneration} settle it after.
 *
 * A `pending` row counts against the cap, so two requests fired at once can't
 * both slip under it; a `failed` row does not, so a provider outage is free for
 * the coach. The window between the two is the only overcount, and it self-heals
 * the moment the call settles.
 */

/** Statuses that consume a credit: in-flight and successful. */
const BILLED_STATUSES = ["pending", "succeeded"] as const;

/**
 * Start of the current calendar month in **America/São_Paulo**, as a UTC instant.
 *
 * The quota is advertised as "10 por mês", so it has to turn over when the
 * coach's month turns over, not when UTC's does — otherwise credits appear to
 * reset at 21:00 on the last day of the month. Brazil has had no DST since 2019,
 * so the offset is a fixed −03:00; `Intl` is used anyway rather than hardcoding
 * it, so this stays correct if that ever changes.
 */
export function monthStart(now: Date, timeZone = "America/Sao_Paulo"): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);

  // The zone's offset right now, derived by comparing local wall-clock to UTC.
  // Seconds are floored on both sides so sub-second drift can't leak in.
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;

  // Midnight on the 1st, local, expressed back in UTC.
  return new Date(Date.UTC(get("year"), get("month") - 1, 1) - offsetMs);
}

/**
 * How many generations this clinic has spent in the current calendar month.
 * Counts in-flight and successful attempts; failures are free.
 */
export async function countGenerationsThisMonth(
  ctx: TenantContext,
  now = new Date(),
): Promise<number> {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(schema.aiGeneration)
    .where(
      and(
        eq(schema.aiGeneration.clinicId, ctx.clinicId),
        gte(schema.aiGeneration.createdAt, monthStart(now)),
        inArray(schema.aiGeneration.status, [...BILLED_STATUSES]),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Whether this aluno already has a generation of this kind in flight. A second
 * concurrent generation for the same aluno would race on `saveDraft`, so the
 * route rejects rather than letting both write.
 */
export async function hasPendingGeneration(
  ctx: TenantContext,
  studentId: string,
  kind: AiGenerationKind,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.aiGeneration.id })
    .from(schema.aiGeneration)
    .where(
      and(
        eq(schema.aiGeneration.clinicId, ctx.clinicId),
        eq(schema.aiGeneration.studentId, studentId),
        eq(schema.aiGeneration.kind, kind),
        eq(schema.aiGeneration.status, "pending"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Claims a credit by writing the `pending` row. Returns its id, which the caller
 * **must** settle with {@link finishGeneration} or {@link failGeneration} — an
 * abandoned `pending` row silently costs the coach a credit for the month.
 */
export async function startGeneration(
  ctx: TenantContext,
  input: {
    studentId: string;
    kind: AiGenerationKind;
    provider: string;
    model: string;
    catalogHash: string;
    anamnesisSnapshotId: string | null;
  },
): Promise<string> {
  const [row] = await ctx.db
    .insert(schema.aiGeneration)
    .values({
      clinicId: ctx.clinicId,
      studentId: input.studentId,
      coachId: ctx.userId,
      kind: input.kind,
      status: "pending",
      provider: input.provider,
      model: input.model,
      catalogHash: input.catalogHash,
      anamnesisSnapshotId: input.anamnesisSnapshotId,
    })
    .returning({ id: schema.aiGeneration.id });
  return row.id;
}

/** What a settled generation records beyond its status. */
export type GenerationOutcome = {
  usage: LlmUsage;
  durationMs: number;
  repaired: boolean;
};

/** Settles a generation as successful, recording what it actually consumed. */
export async function finishGeneration(
  ctx: TenantContext,
  id: string,
  outcome: GenerationOutcome,
): Promise<void> {
  await ctx.db
    .update(schema.aiGeneration)
    .set({
      status: "succeeded",
      inputTokens: outcome.usage.inputTokens,
      cachedInputTokens: outcome.usage.cachedInputTokens,
      outputTokens: outcome.usage.outputTokens,
      durationMs: outcome.durationMs,
      repaired: outcome.repaired,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiGeneration.id, id),
        eq(schema.aiGeneration.clinicId, ctx.clinicId),
      ),
    );
}

/**
 * Settles a generation as failed, which **releases the credit**. `errorCode` is
 * a short machine-readable cause — never a provider body, which can echo prompt
 * content.
 */
export async function failGeneration(
  ctx: TenantContext,
  id: string,
  errorCode: string,
  outcome?: Partial<GenerationOutcome>,
): Promise<void> {
  await ctx.db
    .update(schema.aiGeneration)
    .set({
      status: "failed",
      errorCode,
      inputTokens: outcome?.usage?.inputTokens ?? null,
      cachedInputTokens: outcome?.usage?.cachedInputTokens ?? null,
      outputTokens: outcome?.usage?.outputTokens ?? null,
      durationMs: outcome?.durationMs ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiGeneration.id, id),
        eq(schema.aiGeneration.clinicId, ctx.clinicId),
      ),
    );
}

/** A generation as an audit/usage screen would list it. */
export type AiGenerationRow = {
  id: string;
  studentId: string;
  kind: AiGenerationKind;
  status: string;
  model: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  catalogHash: string | null;
  createdAt: Date;
};

/**
 * This clinic's most recent generations, newest first — the audit read, and the
 * token data the cost model in `docs/monetization.md` is checked against.
 */
export async function listRecentGenerations(
  ctx: TenantContext,
  limit = 50,
): Promise<AiGenerationRow[]> {
  return ctx.db
    .select({
      id: schema.aiGeneration.id,
      studentId: schema.aiGeneration.studentId,
      kind: schema.aiGeneration.kind,
      status: schema.aiGeneration.status,
      model: schema.aiGeneration.model,
      inputTokens: schema.aiGeneration.inputTokens,
      cachedInputTokens: schema.aiGeneration.cachedInputTokens,
      outputTokens: schema.aiGeneration.outputTokens,
      catalogHash: schema.aiGeneration.catalogHash,
      createdAt: schema.aiGeneration.createdAt,
    })
    .from(schema.aiGeneration)
    .where(eq(schema.aiGeneration.clinicId, ctx.clinicId))
    .orderBy(desc(schema.aiGeneration.createdAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/* Platform-admin overview (cross-tenant)                                     */
/* -------------------------------------------------------------------------- */

/** One clinic's AI usage for the month, as the admin table lists it. */
export type AdminAiTenantRow = {
  clinicId: string;
  name: string;
  plan: Plan;
  effectivePlan: Plan;
  /** The clinic's effective monthly allowance. `null` = unlimited. */
  limit: number | null;
  /** Billed generations this month (pending + succeeded) — matches the gate. */
  used: number;
  succeeded: number;
  failed: number;
  /** Successful generations that needed the repair retry. */
  repaired: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type AdminAiOverview = {
  /** First instant of the current São Paulo month, as an ISO string. */
  monthStart: string;
  tenants: AdminAiTenantRow[];
  totals: {
    generations: number;
    succeeded: number;
    failed: number;
    repaired: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    /** Clinics that have spent their whole allowance. */
    clinicsAtLimit: number;
  };
};

/**
 * Every clinic's AI usage for the current month, for the platform-admin screen.
 *
 * This is the read that answers the two questions the pricing model only
 * *assumes*: is 1/10/25 the right shape, and is the catalog prefix actually
 * landing in the provider's cache. Both are unanswerable from the coach-facing
 * counter, which shows one clinic its own total and nothing else.
 *
 * Admin-only and cross-tenant, so it takes a bare `DB` rather than a
 * `TenantContext` — same shape as `whatsapp.getAdminOverview`.
 */
export async function getAdminAiOverview(
  db: DB,
  now = new Date(),
): Promise<AdminAiOverview> {
  const since = monthStart(now);

  const clinics = await db
    .select({
      id: schema.clinic.id,
      name: schema.clinic.name,
      plan: schema.clinic.plan,
      trialEndsAt: schema.clinic.trialEndsAt,
      override: schema.clinic.aiGenerationsOverride,
    })
    .from(schema.clinic);

  // Both plan rows ride along, exactly as `getPlanLimits` does it, so a trialing
  // clinic's allowance here is the same number its own screen shows.
  const limitRows = await db
    .select({
      plan: schema.planLimit.plan,
      aiGenerations: schema.planLimit.aiGenerations,
    })
    .from(schema.planLimit);
  const limitByPlan = new Map(limitRows.map((r) => [r.plan, r]));

  // One grouped pass over the month's rows; the per-status split is done in TS
  // rather than in three more round-trips.
  const rows = await db
    .select({
      clinicId: schema.aiGeneration.clinicId,
      status: schema.aiGeneration.status,
      repaired: schema.aiGeneration.repaired,
      inputTokens: schema.aiGeneration.inputTokens,
      cachedInputTokens: schema.aiGeneration.cachedInputTokens,
      outputTokens: schema.aiGeneration.outputTokens,
    })
    .from(schema.aiGeneration)
    .where(gte(schema.aiGeneration.createdAt, since));

  type Acc = Omit<AdminAiTenantRow, "clinicId" | "name" | "plan" | "effectivePlan" | "limit">;
  const empty = (): Acc => ({
    used: 0,
    succeeded: 0,
    failed: 0,
    repaired: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  });

  const byClinic = new Map<string, Acc>();
  for (const row of rows) {
    const acc = byClinic.get(row.clinicId) ?? empty();
    const billed = (BILLED_STATUSES as readonly string[]).includes(row.status);
    if (billed) acc.used += 1;
    if (row.status === "succeeded") acc.succeeded += 1;
    if (row.status === "failed") acc.failed += 1;
    if (row.repaired) acc.repaired += 1;
    acc.inputTokens += row.inputTokens ?? 0;
    acc.cachedInputTokens += row.cachedInputTokens ?? 0;
    acc.outputTokens += row.outputTokens ?? 0;
    byClinic.set(row.clinicId, acc);
  }

  const tenants = clinics
    .map((c) => {
      const trialActive = isTrialActive(c.plan, c.trialEndsAt, now);
      const effectivePlan = trialActive ? TRIAL_PLAN : c.plan;
      const limitRow = limitByPlan.get(effectivePlan);
      return {
        clinicId: c.id,
        name: c.name,
        plan: c.plan,
        effectivePlan,
        limit: resolveAiGenerations({
          override: c.override,
          rowPresent: limitRow !== undefined,
          rowValue: limitRow?.aiGenerations ?? null,
          effectivePlan,
        }),
        ...(byClinic.get(c.id) ?? empty()),
      };
    })
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name, "pt-BR"));

  const sum = (pick: (t: AdminAiTenantRow) => number) =>
    tenants.reduce((s, t) => s + pick(t), 0);

  return {
    monthStart: since.toISOString(),
    tenants,
    totals: {
      generations: sum((t) => t.used),
      succeeded: sum((t) => t.succeeded),
      failed: sum((t) => t.failed),
      repaired: sum((t) => t.repaired),
      inputTokens: sum((t) => t.inputTokens),
      cachedInputTokens: sum((t) => t.cachedInputTokens),
      outputTokens: sum((t) => t.outputTokens),
      clinicsAtLimit: tenants.filter(
        (t) => t.limit !== null && t.used >= t.limit,
      ).length,
    },
  };
}
