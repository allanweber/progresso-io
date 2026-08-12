import { NextResponse } from "next/server";

import { assessmentHasValues } from "@/lib/checkin-assessment";
import {
  coachFeedbackSchema,
  type CheckinDetailDto,
} from "@/lib/student-checkins";
import { sendCheckinFeedbackWhatsApp } from "@/lib/whatsapp";
import { coachCheckins, plans, students } from "@/server/dal";
import type { AssessmentWriteInput } from "@/server/dal/coach-checkins";
import {
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The coach's feedback on a check-in: sets the response text (clearing the
 * pending state) and optionally attaches/replaces a body assessment. Coach-only;
 * scoped by `clinicId` + `studentId`. The feedback is also sent to the student
 * on WhatsApp (logged in dev).
 */
type Params = { params: Promise<{ id: string; checkinId: string }> };

export const POST = withRoute<Params>(
  "coach.checkin.feedback",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = coachFeedbackSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const assessment: AssessmentWriteInput =
      parsed.data.assessment && assessmentHasValues(parsed.data.assessment)
        ? {
            circumferences: parsed.data.assessment.circumferences,
            skinfolds: parsed.data.assessment.skinfolds,
            bodyFatPct: parsed.data.assessment.bodyFatPct,
          }
        : null;

    const detail = await coachCheckins.submitFeedback(ctx, id, checkinId, {
      feedback: parsed.data.feedback,
      assessment,
    });
    if (!detail) return notFound("Check-in não encontrado.");

    // Deliver the feedback to the student on WhatsApp (logged in dev). Paid-plan
    // channel only — free clinics keep feedback in-portal.
    const student = await students.getStudent(ctx, id);
    if (student?.phone && (await plans.canUseWhatsapp(ctx))) {
      const origin = new URL(request.url).origin;
      await sendCheckinFeedbackWhatsApp({
        to: student.phone,
        firstName: student.firstName,
        feedback: parsed.data.feedback,
        portalUrl: `${origin}/student`,
      }).catch((err) =>
        logger.error("coach.checkin.whatsapp_failed", { err, studentId: id }),
      );
    }

    return NextResponse.json(detail satisfies CheckinDetailDto);
  },
);
