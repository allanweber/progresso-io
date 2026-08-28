import { NextResponse } from "next/server";

import type { CheckinDetailDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";
import { logger } from "@/server/observability";
import { deleteCheckinPhoto } from "@/server/r2";

/**
 * One check-in, coach-side. Coach-only; scoped by `clinicId` + `studentId`, so
 * another clinic's/student's check-in yields a 404.
 *
 * - GET    → the detail (photos + assessment + the plan of record that day).
 * - DELETE → permanently removes it, either author's. Irreversible.
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

/**
 * Permanently deletes a check-in — a duplicate submission, a wrong-student one,
 * a botched import. Available to every coach of the clinic and on every plan:
 * unlike a student, a check-in has no archive to fall back on.
 *
 * The rows go first (the assessment and photo rows cascade); the photo BYTES are
 * removed afterwards, best-effort. Storage is not transactional, so a failure
 * there is logged and the delete still reports success — the row is the source
 * of truth, and an orphaned object is unreachable without its key.
 */
export const DELETE = withCoach<Params>(
  "coach.checkin.delete",
  async (_request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }

    const photoKeys = await coachCheckins.deleteCheckin(ctx, id, checkinId);
    if (!photoKeys) return notFound("Check-in não encontrado.");

    logger.warn("checkin.hard_deleted", {
      checkinId,
      studentId: id,
      clinicId: ctx.clinicId,
      photos: photoKeys.length,
    });

    for (const key of photoKeys) {
      if (!(await deleteCheckinPhoto(key))) {
        // Bytes may survive the row. Not fatal — and expected for the seeded
        // demo keys, which point at no file at all.
        logger.warn("checkin.photo_delete_missed", { checkinId, key });
      }
    }

    return NextResponse.json({ ok: true });
  },
);
