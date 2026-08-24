import { NextResponse } from "next/server";

import { receiveExerciseImage } from "@/server/r2";
import { withCoach } from "@/server/guard";

/**
 * Uploads one image for a coach's custom exercise to R2, returning its stored
 * key. Coach-only; the image itself is not tenant data (a blob in the shared
 * bucket), so the key is returned to the form and only persisted when the
 * exercise is saved via the DAL, which stamps the clinic.
 */
export const POST = withCoach("exercises.image.upload", async (request) => {
  const result = await receiveExerciseImage(request);
  if (!result.ok) return result.response;
  return NextResponse.json({ key: result.key }, { status: 201 });
});
