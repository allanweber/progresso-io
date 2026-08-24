import { NextResponse } from "next/server";

import { receiveExerciseImage } from "@/server/r2";
import { withAdmin } from "@/server/guard";

/**
 * Uploads one image for a base exercise to R2, returning its stored key.
 * Admin-only; the key is returned to the form and persisted when the base
 * exercise is saved via the admin DAL.
 */
export const POST = withAdmin(
  "admin.exercises.image.upload",
  async (request) => {
    const result = await receiveExerciseImage(request);
    if (!result.ok) return result.response;
    return NextResponse.json({ key: result.key }, { status: 201 });
  },
);
