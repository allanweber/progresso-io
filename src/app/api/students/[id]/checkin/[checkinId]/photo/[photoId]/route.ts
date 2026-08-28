import { NextResponse } from "next/server";

import {
  CHECKIN_POSE_LABELS,
  checkinPhotoPoseSchema,
  type CheckinPhotoDto,
} from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { isUuid, notFound, readJson, validationError } from "@/server/api";
import { withCoach } from "@/server/guard";
import { checkinPhotoPlaceholder, readCheckinPhoto } from "@/server/r2";

/**
 * One check-in photo, coach-side. The DAL join proves the photo belongs to a
 * check-in of this student IN THIS CLINIC before anything is read or written,
 * so a coach reaches any of their own students' photos but never another
 * clinic's.
 *
 * - GET   → streams the bytes. Private (no shared/public URL); from R2 (prod) or
 *   the local `.uploads/` fallback (dev/e2e), with a labeled placeholder on a
 *   miss.
 * - PATCH → re-labels it as another pose, swapping with whatever holds that pose
 *   (the left/right mix-up fix).
 */
type Params = { params: Promise<{ id: string; checkinId: string; photoId: string }> };

export const GET = withCoach<Params>(
  "coach.checkin.photo",
  async (_request, ctx, { params }) => {
    const { id, checkinId, photoId } = await params;
    if (!isUuid(id) || !isUuid(checkinId) || !isUuid(photoId)) {
      return notFound("Foto não encontrada.");
    }

    const photo = await coachCheckins.getStudentCheckinPhoto(
      ctx,
      id,
      checkinId,
      photoId,
    );
    if (!photo) return notFound("Foto não encontrada.");

    const found = await readCheckinPhoto(photo.r2Key);
    const { body, contentType } =
      found ?? checkinPhotoPlaceholder(CHECKIN_POSE_LABELS[photo.pose]);

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600",
      },
    });
  },
);

/**
 * Moves this photo to another pose. When that pose is already taken the two
 * trade places, so a coach fixes a left/right mix-up in one action instead of
 * re-uploading. Answers with the check-in's photos in their new order.
 */
export const PATCH = withCoach<Params>(
  "coach.checkin.photo.pose",
  async (request, ctx, { params }) => {
    const { id, checkinId, photoId } = await params;
    if (!isUuid(id) || !isUuid(checkinId) || !isUuid(photoId)) {
      return notFound("Foto não encontrada.");
    }

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const parsed = checkinPhotoPoseSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const photos = await coachCheckins.movePhotoToPose(
      ctx,
      id,
      checkinId,
      photoId,
      parsed.data.pose,
    );
    if (!photos) return notFound("Foto não encontrada.");

    return NextResponse.json({ photos } satisfies { photos: CheckinPhotoDto[] });
  },
);
