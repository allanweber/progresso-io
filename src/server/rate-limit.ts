import { headers } from "next/headers";

/**
 * Small in-process, fixed-window rate limiter for the auth/contact server
 * actions.
 *
 * WHY THIS EXISTS: Better Auth applies its own rate limiter (including the
 * per-minute OTP rules in `@/lib/auth`) as an `onRequest` hook on the mounted
 * `/api/auth/[...all]` HTTP handler. Every sensitive flow here, though, is a
 * *server action* calling `auth.api.*` directly, which never goes through that
 * handler — so without this, sign-in brute force, OTP guessing and OTP/e-mail
 * bombing are unthrottled. This limiter runs at the action boundary to close
 * that gap.
 *
 * SCOPE: in-memory, so it resets on deploy and is per-instance. That's a
 * deliberate, best-effort control for the current single-instance deploy; a
 * horizontally-scaled deploy should back this (and the anamnese-fill limiter)
 * with Redis/Postgres — the call sites stay the same, only `hit` changes.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Cap the map so a flood of distinct keys (e.g. spoofed IPs) can't grow it
// without bound; when exceeded we drop already-expired entries first.
const MAX_KEYS = 20_000;

function prune(now: number): void {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records one hit against `key` and reports whether it is still within budget.
 * Returns `true` when the request is allowed, `false` once `max` hits have been
 * made inside the current `windowMs` window. The window is fixed: the first hit
 * starts it and it resets `windowMs` later.
 */
export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

/**
 * Gives back one hit against `key`, for work that was counted and then failed.
 *
 * Charging for an attempt that never happened is a real cost once the window is
 * long: the contact form's budget is one message per day, so a Resend outage
 * would otherwise tell the visitor "try again" and then refuse the retry for
 * 24 hours, having delivered nothing. Counting first and refunding on failure
 * keeps the limiter in front of the expensive work while still only charging
 * for what actually got done.
 *
 * Deliberately does NOT delete the bucket: the window must keep running, or a
 * caller could reset its own clock by failing on purpose.
 */
export function refund(key: string): void {
  const bucket = buckets.get(key);
  if (bucket && bucket.count > 0) bucket.count -= 1;
}

/** Clears all buckets — test-only helper so cases don't bleed into each other. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/**
 * Drops every bucket whose key starts with `prefix`. Test-only, and reached
 * over HTTP by the e2e suite (`/api/test/rate-limit`).
 *
 * It exists because a long window and an automated suite are incompatible: the
 * contact form allows one message per IP per day, every Playwright worker
 * shares one localhost IP and one server process, and `retries: 1` means the
 * first attempt spends the budget the retry needs. Without this the retry fails
 * deterministically, so any flake becomes a hard failure.
 *
 * Prefixed rather than wholesale so clearing the contact bucket cannot quietly
 * disarm the auth limiters a concurrent spec may be relying on.
 */
export function __clearRateLimit(prefix: string): void {
  for (const key of buckets.keys()) {
    if (key.startsWith(prefix)) buckets.delete(key);
  }
}

/**
 * Best-effort client IP from the proxy headers (Cloudflare / the compose
 * network sit in front of the app). Falls back to a constant bucket when no
 * header is present, so an un-proxied request is still throttled (just shared).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}
