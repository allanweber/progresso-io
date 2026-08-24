import { NextResponse } from "next/server";

import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
import { plans, whatsapp } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withCoach } from "@/server/guard";

/** 403 shown when the clinic's plan doesn't include WhatsApp (Free). */
export function whatsappLocked() {
  return forbidden(
    "Seu plano não inclui o WhatsApp. Faça upgrade para conversar com seus alunos.",
  );
}

/**
 * Coach WhatsApp inbox: the conversation list + templates + this clinic's
 * connection. Coach-only, gated on the plan's `whatsapp` capability (Free
 * excluded), tenant-scoped through the DAL. No external input to validate.
 */
export const GET = withCoach("coach.whatsapp.inbox", async (_request, ctx) => {
  if (!(await plans.canUseWhatsapp(ctx))) return whatsappLocked();

  const inbox = await whatsapp.getInbox(ctx);
  return NextResponse.json({
    ...inbox,
    // Whether the active provider can actually deliver. `false` on the dev
    // provider (no vendor wired) → drives the "nothing is delivered yet" banner.
    deliveryEnabled: getWhatsAppProvider().canDeliver,
  });
});
