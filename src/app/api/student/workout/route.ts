import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { notFound } from "@/server/api";
import { withStudent } from "@/server/guard";

/**
 * The aluno's own workout state: the active published version + read-only
 * history. Aluno-only; the DAL resolves the student from the SESSION (never a
 * client-supplied id) and returns only published versions — a draft is never
 * exposed. A user with no linked student row yields a 404.
 */
export const GET = withStudent(
  "student-portal.workout.state",
  async (_request, ctx) => {
    const state = await studentPortal.getMyWorkoutState(ctx);
    if (!state) return notFound("Aluno não encontrado.");
    return NextResponse.json(state);
  },
);
