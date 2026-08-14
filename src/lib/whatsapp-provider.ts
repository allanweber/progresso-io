import { logger } from "@/server/observability";

/**
 * WhatsApp provider port. Server-only.
 *
 * The application never talks to a concrete WhatsApp vendor directly — it talks
 * to this interface. Which vendor sits behind it (Meta Cloud API, Twilio, Z-API,
 * …) is deliberately undecided: each becomes a single new file implementing
 * `WhatsAppProvider`, selected at runtime by `WHATSAPP_PROVIDER`, with **zero**
 * caller changes. Until a vendor is wired we ship a `dev` provider that logs and
 * never delivers, so the whole inbox (conversations, the 24h window, template
 * fallback) is fully exercisable locally and in tests.
 *
 * Three capabilities cover everything the app needs of WhatsApp:
 *  - `sendSessionMessage` — free-text, only legal inside the 24h customer-service
 *    window (the DAL enforces the window before calling this).
 *  - `sendTemplateMessage` — a pre-approved template, legal at any time.
 *  - `parseInboundWebhook` — turn a raw provider webhook body into normalized
 *    inbound-message / delivery-status events the ingest path understands.
 */

/** Masks all but the last four digits of a phone for logging (PII, see M-2). */
function maskPhone(p: string): string {
  return p.replace(/\d(?=\d{4})/g, "•");
}

/** Outcome of a send attempt. `delivered` is false in the logged/dev path. */
export type ProviderSendResult = {
  delivered: boolean;
  /** Vendor's message id, when the provider returns one (persisted for status). */
  providerMessageId?: string;
};

/** A normalized inbound text message, vendor-agnostic. */
export type InboundMessageEvent = {
  kind: "message";
  /** Sender's phone as the vendor reports it (normalized downstream). */
  from: string;
  /** Plain-text body. */
  body: string;
  /** Vendor's message id, when present. */
  providerMessageId?: string;
};

/** A normalized delivery-status update for a previously-sent message. */
export type StatusEvent = {
  kind: "status";
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
};

export type InboundEvent = InboundMessageEvent | StatusEvent;

export type WhatsAppProvider = {
  /** Stable id, e.g. "dev" | "meta" | "twilio". */
  readonly name: string;
  /** Whether this provider can actually deliver (false for the dev provider). */
  readonly canDeliver: boolean;
  sendSessionMessage(to: string, body: string): Promise<ProviderSendResult>;
  sendTemplateMessage(
    to: string,
    templateKey: string,
    /** Rendered body — variables already substituted by the caller. */
    renderedBody: string,
  ): Promise<ProviderSendResult>;
  /** Parse a raw webhook payload into normalized events (never throws). */
  parseInboundWebhook(payload: unknown): InboundEvent[];
};

/**
 * The local/dev/test provider: logs (with a masked number) and never delivers.
 * `delivered` is always false so callers persist outbound messages as `sent`
 * without ever claiming a real hand-off. It parses no webhooks — a real vendor
 * is required for inbound; dev inbound arrives through the simulate endpoint,
 * which builds `InboundMessageEvent`s directly.
 */
const devProvider: WhatsAppProvider = {
  name: "dev",
  canDeliver: false,
  async sendSessionMessage(to, body) {
    console.info(`[whatsapp:dev] session → ${maskPhone(to)}: ${body}`);
    logger.info("whatsapp.session.logged", { to: maskPhone(to) });
    return { delivered: false };
  },
  async sendTemplateMessage(to, templateKey, renderedBody) {
    console.info(
      `[whatsapp:dev] template(${templateKey}) → ${maskPhone(to)}: ${renderedBody}`,
    );
    logger.info("whatsapp.template.logged", { to: maskPhone(to), templateKey });
    return { delivered: false };
  },
  parseInboundWebhook() {
    logger.warn("whatsapp.webhook.no_provider");
    return [];
  },
};

/**
 * Resolves the active provider from `WHATSAPP_PROVIDER`. Only `dev` exists today;
 * a real vendor is registered here (one `case`) when chosen. Unknown / unset →
 * the dev provider, so nothing can break for lack of configuration.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  const name = process.env.WHATSAPP_PROVIDER?.toLowerCase();
  switch (name) {
    // case "meta": return metaProvider;
    // case "twilio": return twilioProvider;
    case "dev":
    case undefined:
    case "":
      return devProvider;
    default:
      logger.warn("whatsapp.provider.unknown", { name });
      return devProvider;
  }
}
