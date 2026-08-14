import { NextResponse } from "next/server";

import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
import { readJson } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * The WhatsApp provider webhook. A real vendor (Meta / Twilio / Z-API) POSTs
 * inbound messages + delivery-status updates here; we delegate parsing to the
 * active provider's `parseInboundWebhook`. Until a vendor is configured the
 * `dev` provider parses nothing, so this is inert — inbound in local dev arrives
 * through the guarded simulate endpoint instead (see
 * `/api/whatsapp/dev/simulate-inbound`).
 *
 * NOTE: multi-tenant routing (mapping an inbound event to the right clinic via
 * its `whatsapp_connection`) depends on the chosen provider's payload shape
 * (which business number received the message), so it's wired when a provider is
 * picked. Public + unauthenticated by design (providers verify via signatures);
 * always answers 200 so the provider doesn't retry.
 */
export const POST = withRoute(
  "whatsapp.webhook",
  async (request) => {
    const body = await readJson(request);
    const payload = body.ok ? body.data : null;

    const events = getWhatsAppProvider().parseInboundWebhook(payload);
    if (events.length > 0) {
      // A configured provider returned events but tenant routing isn't wired yet.
      logger.warn("whatsapp.webhook.unrouted", { events: events.length });
    }
    return NextResponse.json({ received: true });
  },
  { quiet: true },
);

/** Meta's webhook verification handshake (GET echo of hub.challenge). */
export const GET = withRoute(
  "whatsapp.webhook.verify",
  async (request) => {
    const p = new URL(request.url).searchParams;
    const challenge = p.get("hub.challenge");
    const verifyToken = p.get("hub.verify_token");
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (expected && verifyToken === expected && challenge) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new NextResponse("forbidden", { status: 403 });
  },
  { quiet: true },
);
