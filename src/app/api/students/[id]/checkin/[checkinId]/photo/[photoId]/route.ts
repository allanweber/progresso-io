import { CHECKIN_POSE_LABELS } from "@/lib/student-checkins";
import { coachCheckins } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";
import { checkinPhotoPlaceholder, readCheckinPhoto } from "@/server/r2";

/**
 * Streams one check-in photo's bytes, coach-side. The DAL join proves the photo
 * belongs to a check-in of this student IN THIS CLINIC before anything is read,
 * so a coach can view any of their own students' photos but never another
 * clinic's. Private (no shared/public URL); bytes come from R2 (prod) or the
 * local `.uploads/` fallback (dev/e2e), with a labeled placeholder on a miss.
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
