import { NextResponse } from "next/server";

import type { CheckinDetailDto } from "@/lib/student-checkins";
import { studentCheckins } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withStudent } from "@/server/guard";

/**
 * One check-in's detail (with its photos), for the history modal in Evolução.
 * Aluno-only; the DAL scopes to the aluno's own student, so another student's
 * check-in yields a 404. Photo bytes are served separately, owner-scoped, by
 * the nested photo route.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withStudent<Params>(
  "student.checkin.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Check-in não encontrado.");

    const detail = await studentCheckins.getMyCheckin(ctx, id);
    if (!detail) return notFound("Check-in não encontrado.");
    return NextResponse.json(detail satisfies CheckinDetailDto);
  },
);
