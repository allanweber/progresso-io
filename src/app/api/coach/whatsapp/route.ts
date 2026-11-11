import { NextResponse } from "next/server";

import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
import { plans, whatsapp } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withCoach } from "@/server/guard";

/** 403 shown when WhatsApp is switched off for this clinic (admin override). */
export function whatsappLocked() {
  return forbidden(
    "O WhatsApp está desativado para esta clínica. Fale com o suporte para reativá-lo.",
  );
}

/**
 * Coach WhatsApp inbox: the conversation list + templates + this clinic's
 * connection. Coach-only, gated on the plan's `whatsapp` capability (every plan
 * has it; only an admin override turns it off), tenant-scoped through the DAL. No external input to validate.
 */
export const GET = withCoach("coach.whatsapp.inbox", async (_request, ctx) => {
  if (!(await plans.canUseWhatsapp(ctx))) return whatsappLocked();

  const inbox = await whatsapp.getInbox(ctx);
  const provider = getWhatsAppProvider();
  return NextResponse.json({
    ...inbox,
    // Whether the active provider can actually deliver. `false` on the dev
    // provider (no vendor wired) → drives the "nothing is delivered yet" banner.
    deliveryEnabled: provider.canDeliver,
    deliveryMode: provider.deliveryMode,
  });
});
