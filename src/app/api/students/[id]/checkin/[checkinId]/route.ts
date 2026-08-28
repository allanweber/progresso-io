import { NextResponse } from "next/server";

import type { CheckinDetailDto } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import type { UpdateCoachCheckinInput } from "@/server/dal/coach-checkins";
import {
  parseCoachCheckinForm,
  storeCheckinPhotos,
} from "@/server/checkin-form";
import { apiError, isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";
import { logger } from "@/server/observability";
import { deleteCheckinPhoto } from "@/server/r2";

/**
 * One check-in, coach-side. Coach-only; scoped by `clinicId` + `studentId`, so
 * another clinic's/student's check-in yields a 404.
 *
 * - GET    → the detail (photos + assessment + the plan of record that day).
 * - PATCH  → edits it: date, weight, note, measures, photos. Either author's.
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
 * Edits a check-in — the same multipart body as creating one, so the two cannot
 * validate differently (see `parseCoachCheckinForm`), plus a `removePhotos`
 * field listing poses to drop.
 *
 * The photo rules read from the body: a pose that arrives with a file is added
 * or REPLACED, a pose named in `removePhotos` is dropped, and a pose mentioned
 * in neither is left exactly as it was — so an edit that only fixes the weight
 * never re-uploads four images. Bytes that lose their row are deleted after the
 * commit, best-effort, like the delete path.
 */
export const PATCH = withCoach<Params>(
  "coach.checkin.update",
  async (request, ctx, { params }) => {
    const { id, checkinId } = await params;
    if (!isUuid(id) || !isUuid(checkinId)) {
      return notFound("Check-in não encontrado.");
    }

    const current = await coachCheckins.getStudentCheckin(ctx, id, checkinId);
    if (!current) return notFound("Check-in não encontrado.");

    const form = await parseCoachCheckinForm(request);
    if (!form.ok) return form.response;
    const { date, modality, weightKg, note, assessment, photoFiles, removePoses } =
      form.data;

    // What the check-in will hold once this edit lands — an edit may not empty
    // it out any more than a create may start it empty.
    const keptPoses = new Set(
      current.photos
        .map((p) => p.pose)
        .filter((pose) => !removePoses.includes(pose)),
    );
    for (const { pose } of photoFiles) keptPoses.add(pose);
    if (
      weightKg === null &&
      note === null &&
      keptPoses.size === 0 &&
      assessment === null
    ) {
      return apiError(
        "Informe ao menos um dado (peso, observação, fotos ou medidas).",
        422,
      );
    }

    const input: UpdateCoachCheckinInput = {
      date,
      modality,
      weightKg,
      note,
      photos: await storeCheckinPhotos(photoFiles),
      removePoses,
      assessment,
    };
    const result = await coachCheckins.updateCheckin(ctx, id, checkinId, input);
    if (!result) return notFound("Check-in não encontrado.");

    for (const key of result.orphanedKeys) {
      if (!(await deleteCheckinPhoto(key))) {
        logger.warn("checkin.photo_delete_missed", { checkinId, key });
      }
    }

    return NextResponse.json(result.detail satisfies CheckinDetailDto);
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
