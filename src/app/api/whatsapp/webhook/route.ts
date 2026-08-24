import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
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
 * picked. Public + unauthenticated by design: authenticity comes from the
 * provider's signature, checked via `verifyWebhook` on the provider port before
 * anything is parsed. An accepted request always answers 200 so the provider
 * doesn't retry.
 */
export const POST = withRoute("whatsapp.webhook", async (request) => {
  const provider = getWhatsAppProvider();

  // Read the body as raw text: every vendor signs the exact bytes it sent, so
  // verification must happen before any parse/re-serialize round-trip.
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  if (!provider.verifyWebhook(raw, request.headers)) {
    // Never echo the body or the signature — a rejection log says only that one
    // happened, and for which provider.
    logger.warn("whatsapp.webhook.unverified", { provider: provider.name });
    return new NextResponse("forbidden", { status: 403 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // A verified-but-unparseable body is the vendor's problem, not a retryable
    // failure on our side — answer 200 so it is not redelivered forever.
    logger.warn("whatsapp.webhook.unparseable", { provider: provider.name });
    return NextResponse.json({ received: true });
  }

  const events = provider.parseInboundWebhook(payload);
  if (events.length > 0) {
    // A configured provider returned events but tenant routing isn't wired yet.
    logger.warn("whatsapp.webhook.unrouted", { events: events.length });
  }
  return NextResponse.json({ received: true });
});

/**
 * Constant-time string compare. `===` on a secret leaks its prefix length
 * through timing; `timingSafeEqual` requires equal-length buffers, so unequal
 * lengths short-circuit to false (a length mismatch is not a secret).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Meta's webhook verification handshake (GET echo of hub.challenge). */
export const GET = withRoute("whatsapp.webhook.verify", async (request) => {
  const p = new URL(request.url).searchParams;
  const challenge = p.get("hub.challenge");
  const verifyToken = p.get("hub.verify_token");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && verifyToken && challenge && safeEqual(verifyToken, expected)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  return new NextResponse("forbidden", { status: 403 });
});
