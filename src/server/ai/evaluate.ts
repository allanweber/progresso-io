import {
  normalizePayload,
  settleBodyFat,
  type AiEvaluationDto,
} from "@/lib/ai-evaluation";
import { bodyFatFromSkinfolds } from "@/lib/body-composition";
import {
  getLlmProvider,
  isLlmConfigured,
  type LlmCall,
  type LlmProvider,
  type LlmUsage,
} from "@/lib/llm-provider";
import {
  ai,
  aiSettings,
  checkinEvaluations,
  plans,
  studentAnamneses,
} from "@/server/dal";
import { logger } from "@/server/observability";
import type { TenantContext } from "@/server/tenant";
import { preparePhotos } from "./photos";
import { evaluationSystemPrompt, evaluationUserPrompt } from "./prompts";
import {
  EVALUATION_JSON_SCHEMA,
  evaluationSchema,
  type EvaluationAnswer,
} from "./schemas";

/**
 * The check-in evaluation service.
 *
 * It follows the program generator's shape — audit row before the call, settled
 * after, exactly one model call, every exit path settling the row — because that
 * shape is what makes a failure free and a concurrent request impossible. What
 * is different here is worth stating, because all three are easy to erode:
 *
 * - **The photos are the payload.** This is the only call in the system that
 *   sends images, which means it is the only one with no cacheable prefix and
 *   the only one that needs a multimodal model (`ai_settings.visionModel`).
 * - **The body fat is settled by the server whenever it can be.** Seven folds,
 *   a sex and an age produce a number by arithmetic, and that number overwrites
 *   whatever the model said. Same rule as `rebalance.ts`: what the server can
 *   compute exactly, it computes.
 * - **Sparse data is not a refusal.** An online aluno with a weight and one
 *   photo is the normal case. Only a check-in with nothing on it is refused.
 */

export type EvaluateRefusal =
  | "not_configured"
  | "no_anamnesis"
  | "quota_exceeded"
  | "already_running"
  | "no_checkin_data"
  | "not_found";

export type EvaluateResult =
  | { ok: true; evaluation: AiEvaluationDto; used: number; limit: number | null }
  | { ok: false; refusal: EvaluateRefusal }
  | { ok: false; failed: true; message: string };

/** The generation kind this service writes. One credit, like any other. */
const KIND = "evaluation" as const;

/**
 * Runs one evaluation for a check-in.
 *
 * The gates run cheapest-first, so the most explicable refusal wins: an
 * unconfigured install short-circuits before touching the database, and a
 * missing anamnese is answered before a credit is claimed.
 */
export async function evaluateCheckin(
  ctx: TenantContext,
  checkinId: string,
  /** The coach's free-text steer for this run only. See `evaluationRequestSchema`. */
  instructions: string | null = null,
): Promise<EvaluateResult> {
  if (!isLlmConfigured()) return { ok: false, refusal: "not_configured" };
  const settings = await aiSettings.getAiSettings(ctx.db);
  const provider = getLlmProvider({
    model: settings.visionModel,
    fallbackModels: settings.visionFallbackModels,
  });
  if (!provider.canGenerate) return { ok: false, refusal: "not_configured" };

  const context = await checkinEvaluations.getEvaluationContext(ctx, checkinId);
  if (!context) return { ok: false, refusal: "not_found" };

  // Health-adjacent output about a real person: without a filled anamnese there
  // is no goal, no history and no restrictions to judge the check-in against.
  const anamnesis = await studentAnamneses.getStudentAnamnesis(
    ctx,
    context.student.id,
  );
  if (!anamnesis || anamnesis.status !== "completed") {
    return { ok: false, refusal: "no_anamnesis" };
  }

  if (!checkinEvaluations.hasEvaluableData(context)) {
    return { ok: false, refusal: "no_checkin_data" };
  }

  if (await ai.hasPendingGeneration(ctx, context.student.id, KIND)) {
    return { ok: false, refusal: "already_running" };
  }

  const [limit, used] = await Promise.all([
    plans.getAiGenerationLimit(ctx),
    ai.countGenerationsThisMonth(ctx),
  ]);
  if (limit !== null && used >= limit) {
    return { ok: false, refusal: "quota_exceeded" };
  }

  // The caliper answer, if the protocol was actually completed. Computed before
  // the call so the prompt can say it is already settled.
  const computed = bodyFatFromSkinfolds({
    skinfolds: context.current.skinfolds,
    sex: context.student.sex,
    birthDate: context.student.birthDate,
    onDate: context.current.date,
  });

  const photos = await preparePhotos(context.current.photos);

  const generationId = await ai.startGeneration(ctx, {
    studentId: context.student.id,
    kind: KIND,
    provider: provider.name,
    model: provider.model,
    // No catalog in this prompt, so no hash — and null is the honest value
    // rather than the hash of an empty string, which would look like a cache
    // key that could hit.
    catalogHash: null,
    anamnesisSnapshotId: anamnesis.id,
  });
  const startedAt = Date.now();
  let usage: LlmUsage | null = null;
  let call: LlmCall | null = null;

  try {
    const result = await askModel(provider, {
      system: evaluationSystemPrompt(),
      user: evaluationUserPrompt({
        context,
        poses: photos.map((p) => p.pose),
        computedBodyFatPct: computed,
        sections: anamnesis.sections,
        answers: anamnesis.answers,
        instructions,
      }),
      images: photos.map((p) => p.dataUri),
    });
    usage = result.usage;
    call = result.call;
    const durationMs = Date.now() - startedAt;

    if (!result.ok) {
      await ai.failGeneration(ctx, generationId, result.errorCode, {
        usage: result.usage,
        call: result.call,
        durationMs,
      });
      return { ok: false, failed: true, message: result.message };
    }

    const settled = settleBodyFat(computed, result.answer);
    await checkinEvaluations.saveDraft(ctx, {
      checkinId,
      studentId: context.student.id,
      aiGenerationId: generationId,
      payload: normalizePayload(result.answer, computed),
      ...settled,
    });
    await ai.finishGeneration(ctx, generationId, {
      usage: result.usage,
      call: result.call,
      durationMs,
      // Nothing here is salvaged or repaired: the answer is used as given, or
      // the generation failed. There is no partial evaluation.
      repaired: false,
    });

    logger.info("ai.evaluation", {
      checkinId,
      photos: photos.length,
      source: settled.bodyFatSource,
      verdict: result.answer.verdict,
      instructed: instructions !== null,
    });

    // Read back rather than assembled from what was just written: the draft's
    // id and timestamp are the database's to assign, and a DTO built from the
    // input would be the only place in the system where they were invented.
    const evaluation = await checkinEvaluations.getEvaluation(ctx, checkinId);
    if (!evaluation) {
      return {
        ok: false,
        failed: true,
        message: "Não foi possível salvar a avaliação.",
      };
    }
    return { ok: true, evaluation, used: used + 1, limit };
  } catch (error) {
    // The credit goes back; the tokens do not. Guarded on `pending`, so a throw
    // raised after the row was already settled leaves the real outcome standing.
    await ai
      .failGenerationIfPending(ctx, generationId, "unexpected", {
        usage: usage ?? undefined,
        call,
        durationMs: Date.now() - startedAt,
      })
      .catch(() => {});
    throw error;
  }
}

/**
 * One model call, validated. Never two: whatever comes back is what the coach
 * sees, and an answer that does not fit the schema is a failure that refunds the
 * credit rather than a prompt to try again at the coach's expense.
 */
async function askModel(
  provider: LlmProvider,
  args: { system: string; user: string; images: string[] },
): Promise<
  | { ok: true; answer: EvaluationAnswer; usage: LlmUsage; call: LlmCall | null }
  | {
      ok: false;
      errorCode: string;
      message: string;
      usage: LlmUsage;
      call: LlmCall | null;
    }
> {
  const zero: LlmUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reportedCostMicroUsd: null,
  };
  const result = await provider.generateJson({
    system: args.system,
    user: args.user,
    schemaName: "avaliacao",
    schema: EVALUATION_JSON_SCHEMA as unknown as Record<string, unknown>,
    images: args.images,
  });
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.reason,
      message: result.message,
      usage: result.usage ?? zero,
      call: result.call ?? null,
    };
  }
  const parsed = evaluationSchema.safeParse(result.json);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "invalid_shape",
      message: "O modelo não seguiu o formato pedido.",
      usage: result.usage,
      call: result.call,
    };
  }
  return {
    ok: true,
    answer: parsed.data,
    usage: result.usage,
    call: result.call,
  };
}
