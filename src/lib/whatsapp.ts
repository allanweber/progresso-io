import { captureOutbox } from "@/lib/test-outbox";
import { logger } from "@/server/observability";

/**
 * WhatsApp delivery port. Server-only.
 *
 * WhatsApp is the channel a student receives their portal access link and/or
 * anamnese fill link on. Mirroring the e-mail helper: when no provider is
 * configured (local dev / tests) the message is logged and its actionable links
 * are captured in the test outbox so e2e can drive the flow — a real provider
 * (Meta Cloud API / Twilio / Z-API) is wired later behind this same interface,
 * with no caller change. `sendWhatsApp` never throws in the unconfigured path,
 * so a missing provider can't break registration.
 */

type WhatsAppLink = { kind: string; url: string };

export type WhatsAppMessage = {
  /** Normalized destination number (see @/lib/phone). */
  to: string;
  /** The plain-text message body (PT-BR). */
  body: string;
  /** Actionable links, surfaced to the test outbox (and, later, templated). */
  links?: WhatsAppLink[];
};

/** Whether a real provider is configured. Only its presence is checked here. */
const providerConfigured =
  !!process.env.WHATSAPP_API_URL && !!process.env.WHATSAPP_API_TOKEN;

/**
 * Sends a WhatsApp message. Returns whether it was actually delivered by a
 * provider (`false` in the logged/dev path). Captures each link in the test
 * outbox first, so e2e can read the generated links regardless of provider.
 */
export async function sendWhatsApp(
  msg: WhatsAppMessage,
): Promise<{ delivered: boolean }> {
  for (const link of msg.links ?? []) {
    captureOutbox({ to: msg.to, subject: "WhatsApp", kind: link.kind, url: link.url });
  }

  if (!providerConfigured) {
    console.info(`[whatsapp:dev] to ${msg.to}: ${msg.body}`);
    logger.info("whatsapp.logged", { to: msg.to, links: msg.links?.length ?? 0 });
    return { delivered: false };
  }

  try {
    // Provider call goes here (fetch to WHATSAPP_API_URL with the token). Kept
    // abstract until a vendor is chosen; the caller contract stays the same.
    await fetch(process.env.WHATSAPP_API_URL as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify({ to: msg.to, body: msg.body }),
    });
    logger.info("whatsapp.sent", { to: msg.to });
    return { delivered: true };
  } catch (error) {
    logger.error("whatsapp.send_failed", { err: error, to: msg.to });
    throw error;
  }
}

export type SendWhatsApp = typeof sendWhatsApp;

type OnboardingArgs = {
  to: string;
  clinicName: string;
  firstName: string;
  /** Portal set-password/access link (online students). */
  portalUrl?: string;
  /** Anamnese fill link (when the anamnese is still pending). */
  anamnesisUrl?: string;
};

/**
 * Sends the student their onboarding message — the portal access link and/or
 * the anamnese fill link — in one WhatsApp message (per the design's info box).
 */
export async function sendStudentOnboardingWhatsApp({
  to,
  clinicName,
  firstName,
  portalUrl,
  anamnesisUrl,
}: OnboardingArgs): Promise<{ delivered: boolean }> {
  const lines = [`Olá, ${firstName}! ${clinicName} enviou seu acesso.`];
  const links: WhatsAppLink[] = [];
  if (portalUrl) {
    lines.push(`\n📲 Acesse seu portal: ${portalUrl}`);
    links.push({ kind: "invite", url: portalUrl });
  }
  if (anamnesisUrl) {
    lines.push(`\n📝 Preencha sua anamnese: ${anamnesisUrl}`);
    links.push({ kind: "anamnesis_fill", url: anamnesisUrl });
  }
  return sendWhatsApp({ to, body: lines.join("\n"), links });
}

type CheckinFeedbackArgs = {
  to: string;
  firstName: string;
  /** The coach's feedback text (or a manual check-in's note). */
  feedback: string;
  /** Link back to the student's portal (Evolução). */
  portalUrl?: string;
};

/**
 * Sends the coach's check-in feedback to the student on WhatsApp. WhatsApp isn't
 * wired to a provider yet, so in dev/tests this only logs (and captures the
 * portal link in the test outbox) — the caller contract is stable for when a
 * provider is added. Never throws in the unconfigured path.
 */
export async function sendCheckinFeedbackWhatsApp({
  to,
  firstName,
  feedback,
  portalUrl,
}: CheckinFeedbackArgs): Promise<{ delivered: boolean }> {
  const lines = [`Oi, ${firstName}! Seu coach respondeu seu check-in:`, "", feedback];
  const links: WhatsAppLink[] = [];
  if (portalUrl) {
    lines.push("", `📲 Veja no portal: ${portalUrl}`);
    links.push({ kind: "checkin_feedback", url: portalUrl });
  }
  return sendWhatsApp({ to, body: lines.join("\n"), links });
}
