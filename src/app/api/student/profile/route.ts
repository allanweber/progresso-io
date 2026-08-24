import { NextResponse } from "next/server";

import { studentPortal } from "@/server/dal";
import { notFound } from "@/server/api";
import { withStudent } from "@/server/guard";

/**
 * The aluno's identity for the portal chrome (name, coach, clinic, goal).
 * Aluno-only; resolved from the session's own student row. A user with no
 * linked student yields a 404.
 */
export const GET = withStudent(
  "student-portal.profile",
  async (_request, ctx) => {
    const profile = await studentPortal.getMyProfile(ctx);
    if (!profile) return notFound("Aluno não encontrado.");
    return NextResponse.json(profile);
  },
);
