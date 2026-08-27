import { and, count, desc, eq, gte, or } from "drizzle-orm";

import type { AiGenerationKind, Plan } from "@/db/schema";
import type { DB } from "@/db";
import { schema } from "@/db";
import type { LlmCall, LlmUsage } from "@/lib/llm-provider";
import { TRIAL_PLAN, isTrialActive, resolveAiGenerations } from "@/lib/plans";
import { costMicroUsd, priceAt } from "@/lib/provider-prices";
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

/**
 * How long a `pending` row may keep counting and blocking before it is treated
 * as orphaned.
 *
 * Anything older than this did not settle, and the only way that happens is the
 * process dying mid-call — a deploy or a restart — where no `catch` block ever
 * runs. Ageing it out is what keeps a killed request from locking one aluno out
 * of the feature permanently.
 *
 * The floor is how long a *live* generation can legitimately take: `askWithRepair`
 * makes up to **two** provider calls, each bounded by `TIMEOUT_MS = 90s` in
 * `src/lib/llm-provider.ts`, plus the catalog build and the draft write — call it
 * three and a half minutes. Expiring earlier than that is the dangerous
 * direction: `hasPendingGeneration` would stop blocking while the first request
 * is still running, and two generations for the same aluno would race on
 * `saveDraft` — exactly what the lock exists to prevent. Expiring late only
 * makes a coach wait, so the margin is deliberately lopsided.
 *
 * Coupled to `TIMEOUT_MS` — one call per generation, so that is the whole
 * ceiling. If it grows, or the generator becomes a polled background job (see
 * the docstring on `generateWorkout`'s module), this has to clear the new one.
 */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** The instant before which a still-`pending` row is considered orphaned. */
function pendingCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_TTL_MS);
}

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
        or(
          eq(schema.aiGeneration.status, "succeeded"),
          // A `pending` row bills only while it could still be in flight; past
          // the cutoff it was orphaned by a dead process and must stop eating a
          // credit for the rest of the month.
          and(
            eq(schema.aiGeneration.status, "pending"),
            gte(schema.aiGeneration.createdAt, pendingCutoff(now)),
          ),
        ),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Whether this aluno already has a generation of this kind in flight. A second
 * concurrent generation for the same aluno would race on `saveDraft`, so the
 * route rejects rather than letting both write.
 *
 * Only a **fresh** `pending` row blocks. A row left behind by a process that
 * died mid-call has no one to settle it, and without the cutoff it would answer
 * `already_running` for that aluno forever — there is no reaper and no UI that
 * can clear it. Past {@link PENDING_TTL_MS} it ages out instead.
 */
export async function hasPendingGeneration(
  ctx: TenantContext,
  studentId: string,
  kind: AiGenerationKind,
  now = new Date(),
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
        gte(schema.aiGeneration.createdAt, pendingCutoff(now)),
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
  /**
   * Who actually served it. `null` when the call never reached a model, which
   * leaves the `model` written at `startGeneration` standing as the intent.
   */
  call: LlmCall | null;
  durationMs: number;
  repaired: boolean;
};

/**
 * The routing half of a settled row.
 *
 * `model` is **overwritten**, not merely recorded: the pending row named the
 * model we asked for, and a fallback can have promoted a different one. Pricing
 * the tokens against the slug that did not produce them would be quietly wrong
 * in exactly the direction nobody checks.
 */
function callColumns(call: LlmCall | null | undefined) {
  return call
    ? {
        model: call.model,
        upstreamProvider: call.upstreamProvider,
        requestId: call.requestId,
      }
    : {};
}

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
      ...callColumns(outcome.call),
      inputTokens: outcome.usage.inputTokens,
      cachedInputTokens: outcome.usage.cachedInputTokens,
      cacheWriteTokens: outcome.usage.cacheWriteTokens,
      outputTokens: outcome.usage.outputTokens,
      reportedCostMicroUsd: outcome.usage.reportedCostMicroUsd,
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
      ...callColumns(outcome?.call),
      inputTokens: outcome?.usage?.inputTokens ?? null,
      cachedInputTokens: outcome?.usage?.cachedInputTokens ?? null,
      cacheWriteTokens: outcome?.usage?.cacheWriteTokens ?? null,
      outputTokens: outcome?.usage?.outputTokens ?? null,
      // A refusal or a truncated answer costs real money. Recording it on the
      // failed row is what keeps the ledger honest about a model that burns
      // tokens without producing a program — the credit is refunded, the spend
      // is not.
      reportedCostMicroUsd: outcome?.usage?.reportedCostMicroUsd ?? null,
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

/**
 * Settles a generation as failed **only if it is still `pending`**.
 *
 * The status guard is what makes this safe to call from a `catch` block: the
 * throw may have happened after the row was already settled, and overwriting a
 * `succeeded` row with `failed` would refund a credit the coach actually spent
 * and mark a delivered draft as a failure. A no-op is the correct outcome there.
 *
 * The known failure paths keep calling {@link failGeneration} — they know the
 * row is theirs and unsettled, and the guard would only hide a bug.
 */
export async function failGenerationIfPending(
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
      ...callColumns(outcome?.call),
      inputTokens: outcome?.usage?.inputTokens ?? null,
      cachedInputTokens: outcome?.usage?.cachedInputTokens ?? null,
      cacheWriteTokens: outcome?.usage?.cacheWriteTokens ?? null,
      outputTokens: outcome?.usage?.outputTokens ?? null,
      reportedCostMicroUsd: outcome?.usage?.reportedCostMicroUsd ?? null,
      durationMs: outcome?.durationMs ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiGeneration.id, id),
        eq(schema.aiGeneration.clinicId, ctx.clinicId),
        eq(schema.aiGeneration.status, "pending"),
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
  upstreamProvider: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reportedCostMicroUsd: number | null;
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
      upstreamProvider: schema.aiGeneration.upstreamProvider,
      inputTokens: schema.aiGeneration.inputTokens,
      cachedInputTokens: schema.aiGeneration.cachedInputTokens,
      cacheWriteTokens: schema.aiGeneration.cacheWriteTokens,
      outputTokens: schema.aiGeneration.outputTokens,
      reportedCostMicroUsd: schema.aiGeneration.reportedCostMicroUsd,
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
  /**
   * Billed generations this month — succeeded, plus pendings young enough to
   * still be in flight. Matches the gate in `countGenerationsThisMonth`, which
   * is the point: this is the number the coach is being held to.
   */
  used: number;
  succeeded: number;
  failed: number;
  /** Successful generations the server had to correct (an invented catalog row). */
  repaired: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /**
   * What the month cost, in micro-USD. `null` when nothing could be costed at
   * all — different from zero, and rendered differently.
   *
   * Per row this is **the reported figure when the provider gave one, and the
   * `provider_price` estimate otherwise**. Mixing them is deliberate: the
   * alternative is two columns that each answer part of the question, and an
   * admin who has to add them up by hand to get the number they came for.
   * {@link reportedCostMicroUsd} says how much of it is measured.
   */
  costMicroUsd: number | null;
  /** The measured slice of `costMicroUsd` — what providers actually reported. */
  reportedCostMicroUsd: number | null;
  /**
   * Rows that burned tokens and could be costed neither way: no reported figure
   * and no price in force for their model. The one gap an admin can close.
   */
  unpricedGenerations: number;
};

/**
 * One model's month, across every tenant — the read that makes model shopping
 * possible.
 *
 * Swapping models is now an env var, so the interesting comparison is no longer
 * "what did this clinic spend" but "what does this model cost us, and how often
 * does it need repairing". That question spans tenants and so has no home on the
 * per-clinic table.
 */
export type AdminAiModelRow = {
  model: string;
  /** Distinct upstream hosts that served it, as the aggregator reported them. */
  upstreamProviders: string[];
  generations: number;
  succeeded: number;
  failed: number;
  repaired: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costMicroUsd: number | null;
  reportedCostMicroUsd: number | null;
  /**
   * How many generations actually contributed to `costMicroUsd` — the honest
   * denominator for "cost per generation".
   *
   * Not `generations`: a call that failed before reaching a model spent nothing
   * and has no cost to average, so counting it would quietly understate the
   * per-call figure by however many such rows there happened to be.
   */
  costedGenerations: number;
  unpricedGenerations: number;
};

export type AdminAiOverview = {
  /** First instant of the current São Paulo month, as an ISO string. */
  monthStart: string;
  tenants: AdminAiTenantRow[];
  /** The same month rolled up by model instead of by clinic. */
  models: AdminAiModelRow[];
  totals: {
    generations: number;
    succeeded: number;
    failed: number;
    repaired: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    costMicroUsd: number | null;
    reportedCostMicroUsd: number | null;
    unpricedGenerations: number;
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
 * Cost is computed here rather than stored per row: each generation is matched
 * to the `provider_price` in force when it ran, so correcting a mistyped price
 * fixes history instead of leaving it wrong forever.
 *
 * Admin-only and cross-tenant, so it takes a bare `DB` rather than a
 * `TenantContext` — same shape as `whatsapp.getAdminOverview`.
 */
export async function getAdminAiOverview(
  db: DB,
  now = new Date(),
): Promise<AdminAiOverview> {
  const since = monthStart(now);
  const cutoff = pendingCutoff(now);

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
      provider: schema.aiGeneration.provider,
      model: schema.aiGeneration.model,
      upstreamProvider: schema.aiGeneration.upstreamProvider,
      inputTokens: schema.aiGeneration.inputTokens,
      cachedInputTokens: schema.aiGeneration.cachedInputTokens,
      cacheWriteTokens: schema.aiGeneration.cacheWriteTokens,
      outputTokens: schema.aiGeneration.outputTokens,
      reportedCostMicroUsd: schema.aiGeneration.reportedCostMicroUsd,
      createdAt: schema.aiGeneration.createdAt,
    })
    .from(schema.aiGeneration)
    .where(gte(schema.aiGeneration.createdAt, since));

  // The whole price list, loaded once. It is reference data measured in dozens
  // of rows, so matching in TS beats a correlated subquery per generation — and
  // keeps the effective-dating rule in exactly one place (`priceAt`) rather
  // than restating it in SQL.
  const prices = await db.select().from(schema.providerPrice);

  type Acc = Omit<
    AdminAiTenantRow,
    "clinicId" | "name" | "plan" | "effectivePlan" | "limit"
  >;
  const empty = (): Acc => ({
    used: 0,
    succeeded: 0,
    failed: 0,
    repaired: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    costMicroUsd: null,
    reportedCostMicroUsd: null,
    unpricedGenerations: 0,
  });

  const emptyModel = (model: string): AdminAiModelRow => ({
    model,
    upstreamProviders: [],
    generations: 0,
    succeeded: 0,
    failed: 0,
    repaired: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costMicroUsd: null,
    reportedCostMicroUsd: null,
    costedGenerations: 0,
    unpricedGenerations: 0,
  });

  const byClinic = new Map<string, Acc>();
  const byModel = new Map<string, AdminAiModelRow>();
  const hostsByModel = new Map<string, Set<string>>();

  for (const row of rows) {
    const acc = byClinic.get(row.clinicId) ?? empty();
    const model = byModel.get(row.model) ?? emptyModel(row.model);
    // Same rule as `countGenerationsThisMonth`, deliberately: if the two drift,
    // the admin screen and the coach's own counter tell different stories about
    // the same clinic, and an orphaned row would show it capped while the gate
    // still lets it generate.
    const billed =
      row.status === "succeeded" ||
      (row.status === "pending" && row.createdAt >= cutoff);
    if (billed) acc.used += 1;
    if (row.status === "succeeded") acc.succeeded += 1;
    if (row.status === "failed") acc.failed += 1;
    if (row.repaired) acc.repaired += 1;
    acc.inputTokens += row.inputTokens ?? 0;
    acc.cachedInputTokens += row.cachedInputTokens ?? 0;
    acc.cacheWriteTokens += row.cacheWriteTokens ?? 0;
    acc.outputTokens += row.outputTokens ?? 0;

    model.generations += 1;
    if (row.status === "succeeded") model.succeeded += 1;
    if (row.status === "failed") model.failed += 1;
    if (row.repaired) model.repaired += 1;
    model.inputTokens += row.inputTokens ?? 0;
    model.cachedInputTokens += row.cachedInputTokens ?? 0;
    model.outputTokens += row.outputTokens ?? 0;
    if (row.upstreamProvider) {
      const hosts = hostsByModel.get(row.model) ?? new Set<string>();
      hosts.add(row.upstreamProvider);
      hostsByModel.set(row.model, hosts);
    }

    // Cost it. A row that used no tokens (a failure before the call, say) is
    // neither costed nor counted as uncosted — there is nothing to cost, so it
    // would only dilute the signal.
    const usedTokens =
      (row.inputTokens ?? 0) +
      (row.cachedInputTokens ?? 0) +
      (row.outputTokens ?? 0);
    if (usedTokens > 0) {
      // The provider's own figure first: it is a measurement, it already
      // accounts for whichever host served the call, and it is what the invoice
      // will say. `provider_price` is the estimate that covers everything else —
      // rows from before the switch, and vendors that report no cost at all.
      const reported = row.reportedCostMicroUsd;
      const cost =
        reported ??
        (() => {
          const price = priceAt(prices, row.provider, row.model, row.createdAt);
          return price === null ? null : costMicroUsd(row, price);
        })();

      if (cost === null) {
        acc.unpricedGenerations += 1;
        model.unpricedGenerations += 1;
      } else {
        acc.costMicroUsd = (acc.costMicroUsd ?? 0) + cost;
        model.costMicroUsd = (model.costMicroUsd ?? 0) + cost;
        model.costedGenerations += 1;
      }
      if (reported !== null) {
        acc.reportedCostMicroUsd = (acc.reportedCostMicroUsd ?? 0) + reported;
        model.reportedCostMicroUsd =
          (model.reportedCostMicroUsd ?? 0) + reported;
      }
    }

    byClinic.set(row.clinicId, acc);
    byModel.set(row.model, model);
  }

  const models = [...byModel.values()]
    .map((m) => ({
      ...m,
      upstreamProviders: [...(hostsByModel.get(m.model) ?? [])].sort(),
    }))
    .sort((a, b) => b.generations - a.generations || a.model.localeCompare(b.model));

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
  // `null`, not 0, when nothing could be costed: "we don't know" and "it was
  // free" are different answers and the screen renders them differently.
  const sumNullable = (pick: (t: AdminAiTenantRow) => number | null) => {
    const known = tenants.filter((t) => pick(t) !== null);
    return known.length ? known.reduce((s, t) => s + (pick(t) ?? 0), 0) : null;
  };

  return {
    monthStart: since.toISOString(),
    tenants,
    models,
    totals: {
      generations: sum((t) => t.used),
      succeeded: sum((t) => t.succeeded),
      failed: sum((t) => t.failed),
      repaired: sum((t) => t.repaired),
      inputTokens: sum((t) => t.inputTokens),
      cachedInputTokens: sum((t) => t.cachedInputTokens),
      cacheWriteTokens: sum((t) => t.cacheWriteTokens),
      outputTokens: sum((t) => t.outputTokens),
      costMicroUsd: sumNullable((t) => t.costMicroUsd),
      reportedCostMicroUsd: sumNullable((t) => t.reportedCostMicroUsd),
      unpricedGenerations: sum((t) => t.unpricedGenerations),
      clinicsAtLimit: tenants.filter(
        (t) => t.limit !== null && t.used >= t.limit,
      ).length,
    },
  };
}
