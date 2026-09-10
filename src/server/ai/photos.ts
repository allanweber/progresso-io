import sharp from "sharp";

import type { CheckinPose } from "@/db/schema";
import { logger } from "@/server/observability";
import { readCheckinPhoto } from "@/server/r2";
import type { EvaluationPhoto } from "@/server/dal/checkin-evaluations";

/**
 * Turning stored check-in photos into something a model can be sent.
 *
 * **Data URIs, not links.** The photos live in a private bucket behind our own
 * authenticated route. A URL handed to a provider would either 404 for it or
 * have to be made public, and a publicly-guessable photograph of an aluno's body
 * is not a trade this feature gets to make.
 *
 * **Downscaled first.** A check-in photo is accepted up to 3 MB; four of those
 * base64-encoded is over 16 MB of request body for information the model cannot
 * use. Vision models tile an image at a fixed resolution anyway, so full
 * resolution buys tokens rather than accuracy — and reading body composition is
 * a whole-silhouette judgement, not a skin-texture one.
 */

/**
 * Longest edge, in pixels. Around the tile size most vision models work at, and
 * comfortably enough to judge a silhouette.
 */
const MAX_EDGE = 768;

/** JPEG quality. Photographs, so JPEG; 80 is the usual "no visible loss" mark. */
const JPEG_QUALITY = 80;

/** One photo, ready to send, with the pose it shows. */
export type PreparedPhoto = { pose: CheckinPose; dataUri: string };

/**
 * Reads, downscales and encodes the photos of one check-in.
 *
 * **A photo that cannot be read is skipped, not fatal.** A missing object (a
 * seeded placeholder key, an interrupted upload) must degrade the evaluation to
 * the photos that do exist — which the ladder already handles, right down to no
 * photos at all — rather than fail a call the coach has paid a credit for.
 */
export async function preparePhotos(
  photos: EvaluationPhoto[],
): Promise<PreparedPhoto[]> {
  const prepared: PreparedPhoto[] = [];
  for (const photo of photos) {
    try {
      const stored = await readCheckinPhoto(photo.r2Key);
      if (!stored) continue;
      const resized = await sharp(stored.body)
        // `inside` never enlarges a small photo and never crops a large one:
        // a cropped physique photo is a misleading one.
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      prepared.push({
        pose: photo.pose,
        dataUri: `data:image/jpeg;base64,${resized.toString("base64")}`,
      });
    } catch (error) {
      // Logged rather than swallowed: a decode that fails for every photo is a
      // real problem, and it would otherwise look exactly like an aluno who
      // never uploaded any.
      logger.warn("ai.photo_prepare_failed", { err: error, pose: photo.pose });
    }
  }
  return prepared;
}
