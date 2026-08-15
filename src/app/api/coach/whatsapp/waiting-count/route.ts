import { NextResponse } from "next/server";

import { plans, whatsapp } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * How many WhatsApp conversations are awaiting a coach reply — polled by the
 * sidebar to badge the WhatsApp nav item. Coach-only and tenant-scoped through
 * the DAL. No external input to validate. A clinic without the WhatsApp
 * capability simply gets `0` (rather than a 403), so the shared shell can call
 * this unconditionally without surfacing an error.
 */
export const GET = withRoute("coach.whatsapp.waitingCount", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const count = (await plans.canUseWhatsapp(ctx))
    ? await whatsapp.countWaiting(ctx)
    : 0;
  return NextResponse.json({ count });
});
