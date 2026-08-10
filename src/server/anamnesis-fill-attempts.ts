/**
 * Shared in-memory rate limiter for the public anamnese fill flow's WhatsApp
 * number-confirm step. Keyed by the student-anamnese id (resolved from the fill
 * token), it caps confirm attempts across BOTH the confirm and the submit
 * endpoints, so a forwarded link can't be brute-forced against either. In-memory
 * is enough here: it's a soft, best-effort guard on a low-value check and resets
 * on deploy.
 */

const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

/** Whether the key has spent its confirm attempts within the current window. */
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 0, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  return rec.count >= ATTEMPT_LIMIT;
}

/** Records a failed confirm (wrong number) against the key. */
export function recordFailure(key: string): void {
  const rec = attempts.get(key) ?? {
    count: 0,
    resetAt: Date.now() + ATTEMPT_WINDOW_MS,
  };
  rec.count += 1;
  attempts.set(key, rec);
}
