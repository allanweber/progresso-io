import { NextResponse } from "next/server";

import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { receiveExerciseImage } from "@/server/r2";
import { getTenantContext } from "@/server/tenant";

/**
 * Uploads one image for a coach's custom exercise to R2, returning its stored
 * key. Coach-only; the image itself is not tenant data (a blob in the shared
 * bucket), so the key is returned to the form and only persisted when the
 * exercise is saved via the DAL, which stamps the clinic.
 */
export const POST = withRoute("exercises.image.upload", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const result = await receiveExerciseImage(request);
  if (!result.ok) return result.response;
  return NextResponse.json({ key: result.key }, { status: 201 });
});
