import { NextResponse } from "next/server";

import { workouts } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Creates an exact copy of a workout (a base template or the clinic's own) as a
 * new clinic-owned workout named "<name> (cópia)". Coach-only; the copy is built
 * server-side from the source, so only the `id` param is validated (no body).
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "workouts.copy",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const result = await workouts.copyWorkout(ctx, id);
    if (!result.ok) {
      if (result.reason === "invalid_exercise") {
        return apiError("Um dos exercícios do treino é inválido.", 422);
      }
      return notFound("Treino não encontrado.");
    }
    logger.info("workout.copied", { sourceWorkoutId: id, workoutId: result.id });
    return NextResponse.json({ workout: { id: result.id } }, { status: 201 });
  },
);
