import { NextResponse } from "next/server";

import { studentDiets } from "@/server/dal";
import { withCoach } from "@/server/guard";
import {
  isUuid,
  notFound,
} from "@/server/api";

/**
 * A single published version of a student's diet, for the read-only history
 * view. Coach-only; scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withCoach<Params>(
  "student-diet.version",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const version = await studentDiets.getStudentDietVersion(ctx, id, versionId);
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);
