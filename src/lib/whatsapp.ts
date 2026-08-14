import { captureOutbox } from "@/lib/test-outbox";
import { getWhatsAppProvider } from "@/lib/whatsapp-provider";

/**
 * Outbound WhatsApp helpers. Server-only.
 *
 * WhatsApp is the channel a student receives their portal access link and/or
 * anamnese fill link on. Actual delivery goes through the provider **port**
 * (`@/lib/whatsapp-provider`) — which vendor sits behind it (Meta Cloud API /
 * Twilio / Z-API) is undecided, and until one is wired the `dev` provider logs
 * and never delivers. These helpers add the app-level concerns on top of the
 * port: capturing actionable links in the test outbox (so e2e can drive the
 * flow) and composing the onboarding / feedback bodies. `sendWhatsApp` never
 * throws in the unconfigured path, so a missing provider can't break
 * registration.
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

/**
 * Sends a free-text WhatsApp message through the provider port. Returns whether
 * a provider actually delivered it (`false` in the logged/dev path). Captures
 * each link in the test outbox first, so e2e can read the generated links
 * regardless of provider. Delegates the send (and its masked logging) to the
 * port, so there's a single place a real vendor is wired.
 */
export async function sendWhatsApp(
  msg: WhatsAppMessage,
): Promise<{ delivered: boolean }> {
  for (const link of msg.links ?? []) {
    captureOutbox({ to: msg.to, subject: "WhatsApp", kind: link.kind, url: link.url });
  }
  const { delivered } = await getWhatsAppProvider().sendSessionMessage(
    msg.to,
    msg.body,
  );
  return { delivered };
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
