import { NextResponse } from "next/server";

import { studentWorkouts } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withCoach<Params>(
  "student-workout.export.opengym",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const result = await studentWorkouts.exportOpenGymPlan(ctx, id, versionId);
    if (!result) return notFound("Versão não encontrada.");
    logger.info("student-workout.exported.opengym", { studentId: id, versionId });
    return NextResponse.json(result);
  },
);
