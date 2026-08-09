import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single published workout version's tree, for the aluno's read-only history
 * view. Aluno-only; the DAL scopes to the aluno's own student and to `published`
 * status, so a draft or another student's version yields a 404.
 */
type Params = { params: Promise<{ versionId: string }> };

export const GET = withRoute<Params>(
  "student-portal.workout.version",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "aluno") return forbidden();

    const { versionId } = await params;
    if (!isUuid(versionId)) return notFound("Versão não encontrada.");

    const version = await studentPortal.getMyWorkoutVersion(ctx, versionId);
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);
