import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withStudent } from "@/server/guard";

/**
 * A single published version's tree, for the aluno's read-only history view.
 * Aluno-only; the DAL scopes to the aluno's own student and to `published`
 * status, so a draft or another student's version yields a 404.
 */
type Params = { params: Promise<{ versionId: string }> };

export const GET = withStudent<Params>(
  "student-portal.diet.version",
  async (_request, ctx, { params }) => {
    const { versionId } = await params;
    if (!isUuid(versionId)) return notFound("Versão não encontrada.");

    const version = await studentPortal.getMyDietVersion(ctx, versionId);
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);
