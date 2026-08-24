import { NextResponse } from "next/server";

import { workoutFormSchema } from "@/lib/workouts";
import { workouts } from "@/server/dal";
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
 * A single workout: read its full tree, replace it, archive or unarchive it.
 * Reads see base templates + this clinic's own; every write only ever touches
 * the clinic's own workouts (the DAL scopes by `clinicId`). Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "workouts.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const workout = await workouts.getWorkout(ctx, id);
    if (!workout) return notFound("Treino não encontrado.");
    return NextResponse.json(workout);
  },
);

export const PUT = withCoach<Params>(
  "workouts.update",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = workoutFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await workouts.updateWorkout(ctx, id, parsed.data);
    if (!result.ok) {
      if (result.reason === "invalid_exercise") {
        return apiError("Um dos exercícios selecionados é inválido.", 422);
      }
      return notFound("Treino não encontrado ou não editável.");
    }
    logger.info("workout.updated", { workoutId: id });
    return NextResponse.json({ workout: { id } });
  },
);

export const DELETE = withCoach<Params>(
  "workouts.archive",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const ok = await workouts.archiveWorkout(ctx, id);
    if (!ok) return notFound("Treino não encontrado ou não editável.");
    logger.info("workout.archived", { workoutId: id });
    return NextResponse.json({ workout: { id } });
  },
);

export const PATCH = withCoach<Params>(
  "workouts.unarchive",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const ok = await workouts.unarchiveWorkout(ctx, id);
    if (!ok) return notFound("Treino não encontrado ou não editável.");
    logger.info("workout.unarchived", { workoutId: id });
    return NextResponse.json({ workout: { id } });
  },
);
