import { NextResponse } from "next/server";

import { canUseBrandedPortal } from "@/lib/clinic-settings";
import { clinics } from "@/server/dal";
import { apiError, forbidden, unauthorized } from "@/server/api";
import { receiveClinicLogo } from "@/server/r2";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Uploads the clinic's portal logo (multipart `file`, JPG/PNG/WEBP ≤ 5 MB).
 * Coach-only and paid-plan-gated — the branded portal is a paid feature. Stores
 * the file (R2 or local fallback) and persists its key; the key never leaves the
 * server (the client just learns `hasLogo`).
 */
export const POST = withRoute("coach.settings.logo", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return forbidden();
  if (!canUseBrandedPortal(clinic.plan)) {
    return apiError(
      "O portal personalizado está disponível apenas nos planos pagos.",
      403,
    );
  }

  const result = await receiveClinicLogo(request);
  if (!result.ok) return result.response;

  await clinics.setClinicLogoKey(ctx, result.key);
  return NextResponse.json({ hasLogo: true });
});
