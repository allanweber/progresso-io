import { NextResponse } from "next/server";

import { workouts } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  unauthorized,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Creates an exact copy of a workout (a base template or the clinic's own) as a
 * new clinic-owned workout named "<name> (cópia)". Coach-only; the copy is built
 * server-side from the source, so only the `id` param is validated (no body).
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "workouts.copy",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

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
