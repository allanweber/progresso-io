import { NextResponse } from "next/server";

import { plans, whatsapp } from "@/server/dal";
import { withCoach } from "@/server/guard";

/**
 * How many WhatsApp conversations are awaiting a coach reply — polled by the
 * sidebar to badge the WhatsApp nav item. Coach-only and tenant-scoped through
 * the DAL. No external input to validate. A clinic without the WhatsApp
 * capability simply gets `0` (rather than a 403), so the shared shell can call
 * this unconditionally without surfacing an error.
 */
export const GET = withCoach(
  "coach.whatsapp.waitingCount",
  async (_request, ctx) => {
    const count = (await plans.canUseWhatsapp(ctx))
      ? await whatsapp.countWaiting(ctx)
      : 0;
    return NextResponse.json({ count });
  },
);
