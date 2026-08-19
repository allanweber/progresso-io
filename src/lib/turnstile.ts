import { logger } from "@/server/observability";

/**
 * Cloudflare Turnstile — the visible "Não sou um robô" check on the public
 * contact form.
 *
 * Turnstile rather than reCAPTCHA: no Google account, no cookies dropped on a
 * visitor who has not consented yet (which matters under LGPD and next to our
 * own cookie banner), free at any volume, and it usually resolves without the
 * visitor clicking anything.
 *
 * **Two keys, and they are not interchangeable.** The site key is public and
 * inlined into the browser bundle at BUILD time; the secret is read at runtime
 * and never leaves the server. Both must belong to the same widget, and the
 * widget's allowed-domains list must include the host actually serving the page
 * — a mismatch fails verification with a valid-looking token.
 *
 * **Unset keys mean the check is skipped, not that submissions are refused.**
 * That is the same shape every other optional integration here uses (Resend,
 * R2, Sentry, the LLM), and it is what keeps local dev and the e2e suite
 * working without a Cloudflare account. It also means a production deploy that
 * forgets the keys silently loses the check — hence `turnstile.not_configured`
 * on every skipped verification, so it shows up in the logs rather than only in
 * the spam.
 *
 * The honeypot and fill-clock in `sendContactMessage` stay regardless: they
 * cost nothing, they still run when Turnstile is off, and they catch the
 * scripted traffic that never executes JS at all — which is most of it.
 *
 * **Server-side only.** Importing this from a client component pulls the server
 * logger — and with it `node:async_hooks` — into the browser bundle, which
 * fails the build outright. The contact form therefore reads the public site
 * key straight from `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY` rather than
 * importing anything from here.
 */

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's own response shape; only these two fields are load-bearing. */
type SiteVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

/** Whether the server can actually verify a token. */
export function isTurnstileConfigured(): boolean {
  return SECRET_KEY !== "";
}

/**
 * Verifies a widget token with Cloudflare. `true` when the visitor passed —
 * including when the feature is switched off, since a check that cannot run
 * must not become a wall in front of the contact form.
 *
 * Never throws: Cloudflare being unreachable is not the visitor's fault, and
 * refusing every message during an outage would be a worse failure than letting
 * spam through for a few minutes. The honeypot and fill-clock still apply.
 */
export async function verifyTurnstile(
  token: string | undefined,
  ip?: string,
): Promise<boolean> {
  if (!isTurnstileConfigured()) {
    logger.warn("turnstile.not_configured");
    return true;
  }
  if (!token) {
    // No token with the widget live means the visitor never solved it — or a
    // bot posted straight to the action without loading the page.
    logger.warn("turnstile.missing_token");
    return false;
  }

  const body = new FormData();
  body.set("secret", SECRET_KEY);
  body.set("response", token);
  // Optional, and only a hint: Cloudflare scores it alongside the token.
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) {
      logger.warn("turnstile.rejected", { codes: data["error-codes"] });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("turnstile.verify_failed", { err: error });
    return true;
  }
}
