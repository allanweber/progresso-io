import { NextResponse } from "next/server";

import { studentWorkoutCreateActionSchema } from "@/lib/student-workouts";
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
 * The student's workout state (current published version + in-flight draft +
 * history) and the entry point to start a draft (blank / from a template /
 * editing the active workout). Coach-only; the DAL scopes by `clinicId` +
 * `studentId`.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "student-workout.state",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const state = await studentWorkouts.getStudentWorkoutState(ctx, id);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state);
  },
);

export const POST = withCoach<Params>(
  "student-workout.create",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Aluno não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = studentWorkoutCreateActionSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);
    const action = parsed.data;

    const result =
      action.kind === "blank"
        ? await studentWorkouts.createBlankDraft(ctx, id, action.name)
        : action.kind === "template"
          ? await studentWorkouts.createFromTemplate(
              ctx,
              id,
              action.workoutId,
              action.name,
            )
          : await studentWorkouts.editActive(ctx, id);

    if (!result.ok) {
      switch (result.reason) {
        case "has_draft":
          return apiError("Já existe um rascunho em aberto.", 409);
        case "invalid_exercise":
          return apiError("Um dos exercícios do treino é inválido.", 422);
        case "no_active":
          return apiError("Não há treino ativo para editar.", 409);
        default:
          return notFound("Aluno ou treino não encontrado.");
      }
    }
    logger.info("student-workout.draft.created", {
      studentId: id,
      workoutId: result.workoutId,
      kind: action.kind,
    });
    return NextResponse.json(
      { workoutId: result.workoutId, versionId: result.versionId },
      { status: 201 },
    );
  },
);
