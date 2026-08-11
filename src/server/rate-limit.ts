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

/** Clears all buckets — test-only helper so cases don't bleed into each other. */
export function __resetRateLimit(): void {
  buckets.clear();
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
