import { CHECKIN_POSE_LABELS } from "@/lib/student-checkins";
import { studentCheckins } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { checkinPhotoPlaceholder, readCheckinPhoto } from "@/server/r2";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Streams one check-in photo's bytes, **owner-scoped**: the DAL join proves the
 * photo belongs to this aluno's own check-in before anything is read. Private
 * (no shared/public URL); the bytes come from R2 in prod or the local `.uploads/`
 * fallback in dev/e2e. A missing object (e.g. a seeded placeholder key) falls
 * back to a labeled SVG placeholder so the modal never shows a broken image.
 */
type Params = { params: Promise<{ id: string; photoId: string }> };

export const GET = withRoute<Params>(
  "student.checkin.photo",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "aluno") return forbidden();

    const { id, photoId } = await params;
    if (!isUuid(id) || !isUuid(photoId)) return notFound("Foto não encontrada.");

    const photo = await studentCheckins.getMyCheckinPhoto(ctx, id, photoId);
    if (!photo) return notFound("Foto não encontrada.");

    const found = await readCheckinPhoto(photo.r2Key);
    const { body, contentType } =
      found ?? checkinPhotoPlaceholder(CHECKIN_POSE_LABELS[photo.pose]);

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "content-type": contentType,
        // Private: this is the aluno's own progress photo, never shared.
        "cache-control": "private, max-age=3600",
      },
    });
  },
);
