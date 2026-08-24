import { NextResponse } from "next/server";

import { saveWorkoutAsTemplateSchema } from "@/lib/student-workouts";
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
 * Exports a student's workout version to the clinic's template catalog (a new
 * reusable `workout`). Defaults to the active workout's latest published
 * version; a `versionId` picks a specific one. Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "student-workout.save-as-template",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = saveWorkoutAsTemplateSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await studentWorkouts.saveAsTemplate(
      ctx,
      id,
      parsed.data.versionId,
    );
    if (!result.ok) {
      if (result.reason === "invalid_exercise") {
        return apiError("Um dos exercícios do treino é inválido.", 422);
      }
      return notFound("Nenhuma versão para salvar como modelo.");
    }
    logger.info("student-workout.saved-as-template", {
      studentId: id,
      workoutId: result.id,
    });
    return NextResponse.json({ workout: { id: result.id } }, { status: 201 });
  },
);
