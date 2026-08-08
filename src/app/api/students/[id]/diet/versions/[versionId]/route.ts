import { NextResponse } from "next/server";

import { studentDiets } from "@/server/dal";
import {
  forbidden,
  isUuid,
  notFound,
  unauthorized,
} from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single published version of a student's diet, for the read-only history
 * view. Coach-only; scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withRoute<Params>(
  "student-diet.version",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const version = await studentDiets.getStudentDietVersion(ctx, id, versionId);
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);
