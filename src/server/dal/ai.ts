import { and, count, desc, eq, gte, inArray } from "drizzle-orm";

import type { AiGenerationKind } from "@/db/schema";
import { schema } from "@/db";
import type { LlmUsage } from "@/lib/llm-provider";
import type { TenantContext } from "@/server/tenant";

/**
 * AI generation accounting. Every row is tenant-scoped by `ctx.clinicId`.
 *
 * `ai_generation` is the quota meter, the audit trail and the cost ledger at
 * once — the monthly cap is a count of rows, never a stored counter, so nothing
 * needs resetting and nothing can drift out of step with reality.
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
  /** Frozen at write time — see `costMicroUsdFor`. `null` with no tariff set. */
  costMicroUsd: number | null;
  durationMs: number;
  repaired: boolean;
};

/** Settles a generation as successful, recording what it actually cost. */
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
      costMicroUsd: outcome.costMicroUsd,
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
      costMicroUsd: outcome?.costMicroUsd ?? null,
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
  costMicroUsd: number | null;
  catalogHash: string | null;
  createdAt: Date;
};

/**
 * This clinic's most recent generations, newest first — the audit read, and the
 * data the cost model in `docs/monetization.md` is checked against.
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
      costMicroUsd: schema.aiGeneration.costMicroUsd,
      catalogHash: schema.aiGeneration.catalogHash,
      createdAt: schema.aiGeneration.createdAt,
    })
    .from(schema.aiGeneration)
    .where(eq(schema.aiGeneration.clinicId, ctx.clinicId))
    .orderBy(desc(schema.aiGeneration.createdAt))
    .limit(limit);
}
