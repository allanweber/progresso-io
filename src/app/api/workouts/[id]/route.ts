import { NextResponse } from "next/server";

import { workoutFormSchema } from "@/lib/workouts";
import { workouts } from "@/server/dal";
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
 * A single workout: read its full tree, replace it, archive or unarchive it.
 * Reads see base templates + this clinic's own; every write only ever touches
 * the clinic's own workouts (the DAL scopes by `clinicId`). Coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "workouts.detail",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const workout = await workouts.getWorkout(ctx, id);
    if (!workout) return notFound("Treino não encontrado.");
    return NextResponse.json(workout);
  },
);

export const PUT = withRoute<Params>(
  "workouts.update",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

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

export const DELETE = withRoute<Params>(
  "workouts.archive",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const ok = await workouts.archiveWorkout(ctx, id);
    if (!ok) return notFound("Treino não encontrado ou não editável.");
    logger.info("workout.archived", { workoutId: id });
    return NextResponse.json({ workout: { id } });
  },
);

export const PATCH = withRoute<Params>(
  "workouts.unarchive",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const ok = await workouts.unarchiveWorkout(ctx, id);
    if (!ok) return notFound("Treino não encontrado ou não editável.");
    logger.info("workout.unarchived", { workoutId: id });
    return NextResponse.json({ workout: { id } });
  },
);
