import { NextResponse } from "next/server";

import type { CheckinDetailDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * One check-in's detail (photos + assessment), coach-side. Coach-only; scoped by
 * `clinicId` + `studentId`, so another clinic's/student's check-in yields a 404.
 */
type Params = { params: Promise<{ id: string; checkinId: string }> };

export const GET = withCoach<Params>(
  "coach.checkin.detail",
  async (_request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) return notFound("Check-in não encontrado.");

    const detail = await coachCheckins.getStudentCheckin(ctx, id, checkinId);
    if (!detail) return notFound("Check-in não encontrado.");
    return NextResponse.json(detail satisfies CheckinDetailDto);
  },
);
