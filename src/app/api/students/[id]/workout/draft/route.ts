import { NextResponse } from "next/server";

import { workoutFormSchema } from "@/lib/workouts";
import { studentWorkouts } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * The in-flight draft of a student's workout: save it (whole tree) or discard
 * it. The payload is the same whole-tree shape as a template workout
 * (`workoutFormSchema`); the DAL stores the reference structure. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const PUT = withCoach<Params>(
  "student-workout.draft.save",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = workoutFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentWorkouts.saveDraft(ctx, id, parsed.data);
    if (!result.ok) {
      if (result.reason === "invalid_exercise") {
        return apiError("Um dos exercícios do treino é inválido.", 422);
      }
      return notFound("Nenhum rascunho em aberto.");
    }
    logger.info("student-workout.draft.saved", {
      studentId: id,
      workoutId: result.workoutId,
    });
    return NextResponse.json({
      workoutId: result.workoutId,
      versionId: result.versionId,
    });
  },
);

export const DELETE = withCoach<Params>(
  "student-workout.draft.discard",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const ok = await studentWorkouts.discardDraft(ctx, id);
    if (!ok) return notFound("Nenhum rascunho em aberto.");
    logger.info("student-workout.draft.discarded", { studentId: id });
    return NextResponse.json({ ok: true });
  },
);
