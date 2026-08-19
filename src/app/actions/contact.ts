"use server";

import { CONTACT_LIMITS } from "@/lib/contact";
import { sendContactEmail } from "@/lib/email";
import { verifyTurnstile } from "@/lib/turnstile";
import { logger } from "@/server/observability";
import { clientIp, hit, refund } from "@/server/rate-limit";
import { type FieldErrors, parseForm, z } from "@/lib/validation";

/**
 * Bot defence, in three layers.
 *
 * **Cloudflare Turnstile** is the one the visitor sees — the "Não sou um robô"
 * widget, checked server-side in `@/lib/turnstile`. It is also the only layer
 * that can be switched off by configuration, so the two below are what stand
 * between the inbox and a spam run when it is.
 *
 * The other two are invisible and cost the visitor nothing. They are not
 * redundant with Turnstile: they catch the scripted traffic that POSTs to this
 * action without ever loading the page or executing a line of JS, which is most
 * of what a public contact form actually receives.
 *
 * Under all three sits the pre-existing per-IP limit below, which bounds the
 * damage from anything that gets past them.
 */

/**
 * Layer 2 — the honeypot. An off-screen field no human ever sees; a scraper
 * that fills every input it finds gives itself away by filling this one.
 * `website` is the name, because "leave your website" is exactly the field
 * spam bots most want to fill.
 */
const HONEYPOT_FIELD = "website";

/** The field name the Turnstile widget injects into the form. Cloudflare's. */
const TURNSTILE_FIELD = "cf-turnstile-response";

/**
 * Layer 3 — the fill clock. Nobody reads a form, writes ten characters of
 * Portuguese and submits inside two seconds; a script does it instantly.
 *
 * Optional by design: the timestamp is set by JS on mount, so a visitor with
 * scripting off sends none, and no timestamp means the check is skipped rather
 * than the message dropped. It is also client input and therefore forgeable —
 * it raises the cost of a naive replay, it does not stand on its own, which is
 * why the honeypot is layer 1 and not layer 2.
 */
const MIN_FILL_MS = 2_000;
/** A tab left open overnight, or a captured POST being replayed later. */
const MAX_FORM_AGE_MS = 12 * 60 * 60_000;

export type ContactState =
  | { formError?: string; fieldErrors?: FieldErrors; ok?: boolean }
  | undefined;

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome.")
    .max(CONTACT_LIMITS.name, `Nome muito longo (máx. ${CONTACT_LIMITS.name}).`),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(
      CONTACT_LIMITS.email,
      `E-mail muito longo (máx. ${CONTACT_LIMITS.email}).`,
    )
    .pipe(z.email("Informe um e-mail válido.")),
  message: z
    .string()
    .trim()
    .min(10, "Escreva uma mensagem com pelo menos 10 caracteres.")
    .max(
      CONTACT_LIMITS.message,
      `Mensagem muito longa (máx. ${CONTACT_LIMITS.message}).`,
    ),
  // Both bot fields are validated here rather than read raw off the FormData,
  // because the project rule is that *every* external input is parsed by zod —
  // and a field only a bot touches is the last one worth trusting.
  // No upper bound that can FAIL: a bot stuffing 10KB into the honeypot must
  // still fall through to the silent trap below. A `max()` here would reject it
  // at the schema instead, answering with field errors rather than the
  // indistinguishable success screen — which is precisely the tuning signal the
  // silent path exists to withhold.
  [HONEYPOT_FIELD]: z.string().optional(),
  renderedAt: z.coerce.number().int().positive().optional().catch(undefined),
  // Injected into the form by the Turnstile widget. Bounded because it is
  // attacker-controlled and goes into an outbound request body.
  [TURNSTILE_FIELD]: z.string().max(4096).optional(),
});

export async function sendContactMessage(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

  const {
    [HONEYPOT_FIELD]: honeypot,
    [TURNSTILE_FIELD]: turnstileToken,
    renderedAt,
    ...message
  } = parsed.data;

  // A bot is answered with the same success screen a human gets. Telling it
  // "rejected" is free tuning feedback — it would retry until it found the
  // shape that works. Silence costs us nothing: the message is simply dropped.
  // A NEGATIVE elapsed means the visitor's clock runs ahead of ours, not that
  // they answered before the page existed. Treated as "no timestamp" rather
  // than as a bot: `renderedAt` is stamped by the browser and compared against
  // the server's clock, so a device a few seconds fast would otherwise trip
  // `too_fast` and have its message silently discarded — invisible to them and
  // to us, which is the worst possible way to lose a lead.
  const raw = renderedAt === undefined ? null : Date.now() - renderedAt;
  const elapsed = raw !== null && raw < 0 ? null : raw;
  const trap =
    honeypot !== undefined && honeypot !== ""
      ? "honeypot"
      : elapsed !== null && elapsed < MIN_FILL_MS
        ? "too_fast"
        : elapsed !== null && elapsed > MAX_FORM_AGE_MS
          ? "stale"
          : null;
  if (trap !== null) {
    logger.warn("contact.bot_rejected", { trap, elapsed });
    return { ok: true };
  }

  const ip = await clientIp();

  // Turnstile, unlike the silent traps above, says so out loud: a real visitor
  // whose challenge expired (they sit on the page too long) needs to be told to
  // solve it again, not left staring at a form that claims it worked.
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return {
      formError: "Confirme que você não é um robô e envie novamente.",
    };
  }

  // One message per IP per day. Deliberately strict — this form opens a
  // conversation, and nobody with something real to say needs to start two in
  // the same day — but it is the check most likely to catch an innocent
  // visitor, so three properties of it are worth stating plainly:
  //
  // - **Fixed window, not a calendar day.** The first message starts a 24h
  //   clock; the second is refused until 24h after the *first*, not at midnight.
  // - **Shared addresses share the budget.** A gym, a clinic behind one NAT, or
  //   any mobile carrier doing CGNAT puts many real people on one IP. The
  //   second of them to write that day is refused, and the message below is
  //   what they see — so it names the wait rather than implying they did
  //   something wrong.
  // - **It resets on deploy.** The store is in-process (see
  //   `src/server/rate-limit.ts`), and a 24h window is far more exposed to that
  //   than the 1h one it replaces: every restart hands every IP a fresh budget.
  //   Backing the limiter with Redis/Postgres is what makes a limit this long
  //   actually hold for a day.
  const bucketKey = `contact:${ip}`;
  if (!hit(bucketKey, 1, 24 * 60 * 60_000)) {
    return {
      formError:
        "Você já enviou uma mensagem hoje. Aguarde 24 horas ou responda o e-mail que enviamos.",
    };
  }

  try {
    await sendContactEmail(message);
  } catch {
    // Give the day's budget back. The message never went anywhere, and telling
    // someone "tente novamente" while the retry is already refused for 24h is
    // the worst of both: no message delivered, and a visitor locked out by a
    // failure that was ours.
    refund(bucketKey);
    return {
      formError: "Não foi possível enviar sua mensagem. Tente novamente.",
    };
  }
  return { ok: true };
}
