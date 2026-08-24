import { NextResponse } from "next/server";

import { studentWorkouts } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * A single published version of a student's workout, for the read-only history
 * view. Coach-only; scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withCoach<Params>(
  "student-workout.version",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const version = await studentWorkouts.getStudentWorkoutVersion(
      ctx,
      id,
      versionId,
    );
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);
