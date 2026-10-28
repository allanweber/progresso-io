import { NextResponse } from "next/server";

import { workouts } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "workouts.export.opengym",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Treino não encontrado.");

    const result = await workouts.exportOpenGymPlan(ctx, id);
    if (!result) return notFound("Treino não encontrado.");
    logger.info("workout.exported.opengym", { workoutId: id });
    return NextResponse.json(result);
  },
);
