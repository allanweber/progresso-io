import { NextResponse } from "next/server";

import type { CheckinDetailDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * One check-in's detail (photos + assessment), coach-side. Coach-only; scoped by
 * `clinicId` + `studentId`, so another clinic's/student's check-in yields a 404.
 */
type Params = { params: Promise<{ id: string; checkinId: string }> };

export const GET = withRoute<Params>(
  "coach.checkin.detail",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) return notFound("Check-in não encontrado.");

    const detail = await coachCheckins.getStudentCheckin(ctx, id, checkinId);
    if (!detail) return notFound("Check-in não encontrado.");
    return NextResponse.json(detail satisfies CheckinDetailDto);
  },
);
