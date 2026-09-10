import { NextResponse } from "next/server";

import { evaluationAcceptSchema, defaultNoteBody } from "@/lib/ai-evaluation";
import type { StudentNoteDto } from "@/lib/student-notes";
import { checkinEvaluations, coachCheckins, studentNotes } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * Accepting an AI evaluation — the one write that turns a suggestion into
 * record.
 *
 * Three things happen, and the order matters: the body fat lands on the
 * check-in's assessment (creating one if the coach never filled the form), the
 * draft is marked accepted, and a coach-only note is written. If the note write
 * failed after the assessment was updated the coach would see a number with no
 * explanation of where it came from, so the note goes last — the step that can
 * be retried is the one that leaves the least behind.
 *
 * **The student-facing feedback is deliberately untouched.** The advice is
 * written to the coach, in a register that is wrong for the aluno; pre-filling
 * the box the aluno will read is how AI text reaches clients verbatim.
 */
type Params = { params: Promise<{ id: string; checkinId: string }> };

export const POST = withCoach<Params>(
  "coach.checkin.evaluation.accept",
  async (request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = evaluationAcceptSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const evaluation = await checkinEvaluations.getEvaluation(ctx, checkinId);
    if (!evaluation) return notFound("Avaliação não encontrada.");
    if (evaluation.status !== "pending") {
      // Accepting twice would write a second note for one evaluation, which is
      // the kind of duplicate a coach can only clean up by hand.
      return apiError("Esta avaliação já foi decidida.", 409);
    }

    // The percentage is only ever written with the source that produced it: a
    // caliper reading and a photo estimate must stay distinguishable on the
    // evolution chart, and a coach's manual correction of either is still the
    // number they chose, so the original source stands.
    if (parsed.data.bodyFatPct !== null) {
      const saved = await coachCheckins.setAssessmentBodyFat(ctx, id, checkinId, {
        bodyFatPct: parsed.data.bodyFatPct,
        bodyFatSource: evaluation.bodyFatSource ?? "estimate",
      });
      if (!saved) return notFound("Check-in não encontrado.");
    }

    await checkinEvaluations.settleEvaluation(
      ctx,
      checkinId,
      "accepted",
      parsed.data.bodyFatPct,
    );

    // Whether the coach kept the model's words or rewrote them. Two very
    // different votes on the output, and only one of them is visible in the
    // note body afterwards.
    const acceptance =
      parsed.data.body.trim() === defaultNoteBody(evaluation.payload).trim()
        ? "accepted"
        : "accepted_edited";

    const note = await studentNotes.createNote(ctx, {
      studentId: id,
      checkinId,
      source: "ai_evaluation",
      body: parsed.data.body,
      payload: evaluation.payload,
      acceptance,
      bodyFatPct: parsed.data.bodyFatPct,
    });
    if (!note) return notFound("Aluno não encontrado.");
    return NextResponse.json({ note } satisfies { note: StudentNoteDto });
  },
);
