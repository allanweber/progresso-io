import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { notFound } from "@/server/api";
import { withStudent } from "@/server/guard";

/**
 * The aluno's own diet state: the active published version + read-only history.
 * Aluno-only, and the DAL resolves the student from the SESSION (never a
 * client-supplied id) and returns only published versions — a draft is never
 * exposed. A user with no linked student row yields a 404.
 */
export const GET = withStudent(
  "student-portal.diet.state",
  async (_request, ctx) => {
    const state = await studentPortal.getMyDietState(ctx);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state);
  },
);
