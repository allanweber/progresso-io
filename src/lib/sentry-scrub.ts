import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Sentry PII backstop. This is a Brazilian **health-data** app under LGPD, so
 * even though `sendDefaultPii: false` already keeps the SDK from attaching IPs,
 * cookies and headers, we strip credentials and personal data from anything that
 * slipped into an event before it leaves the process. Type-only import, so this
 * file is safe to bundle into the browser SDK.
 *
 * Keys are matched case-insensitively as a substring of the key name, at any
 * depth. Keep this list ahead of what call sites might attach.
 */
const SENSITIVE =
  /(password|otp|token|secret|authorization|cookie|access_?token|refresh_?token|id_?token|database_?url|better_auth_secret|resend_api_key|google_client_secret|phone|whatsapp|email|first_?name|last_?name|full_?name|student_?name|cpf)/i;

const REDACTED = "[redacted]";

/** Deep-copy with sensitive keys masked. Bounded depth guards against cycles. */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.test(key) ? REDACTED : scrub(val, depth + 1);
  }
  return out;
}

/**
 * Sentry `beforeSend` hook (browser + server). Drops request cookies/headers and
 * the query string wholesale (invite/fill links carry tokens there), and masks
 * any sensitive keys left in request data, `extra` or `contexts`.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.data !== undefined) {
      event.request.data = scrub(event.request.data);
    }
  }
  if (event.extra) {
    event.extra = scrub(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrub(event.contexts) as typeof event.contexts;
  }
  return event;
}
