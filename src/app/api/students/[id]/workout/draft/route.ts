import { NextResponse } from "next/server";

import { workoutFormSchema } from "@/lib/workouts";
import { studentWorkouts } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The in-flight draft of a student's workout: save it (whole tree) or discard
 * it. The payload is the same whole-tree shape as a template workout
 * (`workoutFormSchema`); the DAL stores the reference structure. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const PUT = withRoute<Params>(
  "student-workout.draft.save",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

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

export const DELETE = withRoute<Params>(
  "student-workout.draft.discard",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const ok = await studentWorkouts.discardDraft(ctx, id);
    if (!ok) return notFound("Nenhum rascunho em aberto.");
    logger.info("student-workout.draft.discarded", { studentId: id });
    return NextResponse.json({ ok: true });
  },
);
