import { NextResponse } from "next/server";

import {
  EVALUATION_REFUSAL_MESSAGES,
  evaluationRequestSchema,
  type AiEvaluationRunDto,
  type EvaluationRefusalCode,
} from "@/lib/ai-evaluation";
import { checkinEvaluations } from "@/server/dal";
import { evaluateCheckin } from "@/server/ai/evaluate";
import { apiError, isUuid, notFound, readJson, validationError } from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * The AI evaluation of one check-in: run it, read the draft, discard it.
 *
 * Coach-only, scoped by `clinicId`. There is deliberately no aluno-facing twin
 * of this route — the evaluation and the note it becomes are the coach's record,
 * and the portal must never be able to reach either.
 */
type Params = { params: Promise<{ id: string; checkinId: string }> };

/**
 * Refusals map to a status the client can branch on without parsing prose. The
 * codes are the program generator's plus this feature's own, and they carry the
 * same meanings — a coach who has learned what 402 means on the Treino tab has
 * learned it here.
 */
const REFUSAL_STATUS: Record<EvaluationRefusalCode, number> = {
  // Not the coach's fault and not fixable by retrying.
  not_configured: 503,
  no_anamnesis: 409,
  quota_exceeded: 402,
  already_running: 409,
  // The check-in is empty. 409 rather than 400: the request was well-formed,
  // the state it addresses simply has nothing in it.
  no_checkin_data: 409,
};

export const POST = withCoach<Params>(
  "coach.checkin.evaluate",
  async (request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = evaluationRequestSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await evaluateCheckin(ctx, checkinId, parsed.data.instructions);

    if (!result.ok && "refusal" in result) {
      if (result.refusal === "not_found") {
        return notFound("Check-in não encontrado.");
      }
      return apiError(
        EVALUATION_REFUSAL_MESSAGES[result.refusal],
        REFUSAL_STATUS[result.refusal],
      );
    }
    // A provider failure costs no credit (the audit row is settled `failed`),
    // so the coach can simply press the button again.
    if (!result.ok) return apiError(result.message, 502);

    return NextResponse.json({
      evaluation: result.evaluation,
      used: result.used,
      limit: result.limit,
    } satisfies AiEvaluationRunDto);
  },
);

/** The stored draft, if there is one. `null` is a normal answer, not a 404. */
export const GET = withCoach<Params>(
  "coach.checkin.evaluation.get",
  async (_request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }
    const evaluation = await checkinEvaluations.getEvaluation(ctx, checkinId);
    return NextResponse.json({ evaluation });
  },
);

/**
 * Discards the draft.
 *
 * The row is **kept** and marked `discarded` rather than deleted: the credit was
 * spent, and "the coach threw this one away" is the single most useful signal
 * there is about whether the feature is any good. Regenerating overwrites it.
 */
export const DELETE = withCoach<Params>(
  "coach.checkin.evaluation.discard",
  async (_request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }
    const ok = await checkinEvaluations.settleEvaluation(
      ctx,
      checkinId,
      "discarded",
    );
    if (!ok) return notFound("Avaliação não encontrada.");
    return NextResponse.json({ ok: true });
  },
);
