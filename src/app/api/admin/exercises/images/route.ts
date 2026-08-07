import { NextResponse } from "next/server";

import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";
import { receiveExerciseImage } from "@/server/r2";

/**
 * Uploads one image for a base exercise to R2, returning its stored key.
 * Admin-only; the key is returned to the form and persisted when the base
 * exercise is saved via the admin DAL.
 */
export const POST = withRoute("admin.exercises.image.upload", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const result = await receiveExerciseImage(request);
  if (!result.ok) return result.response;
  return NextResponse.json({ key: result.key }, { status: 201 });
});
