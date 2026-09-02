/**
 * Test-only in-memory e-mail outbox. Because invite tokens are stored hashed,
 * an end-to-end test can't reconstruct the emailed link from the database — nor
 * the one-time codes, which are never stored in readable form — so, ONLY when
 * `ENABLE_TEST_OUTBOX=true`, those outgoing e-mails are also captured
 * here and exposed via the env-gated `/api/test/outbox` route for Playwright to
 * read. The flag is never set in production, where this store stays empty and
 * the route 404s. State is process-local (fine for the single-process dev/e2e
 * server; it is not a real mailbox).
 */

export const TEST_OUTBOX_ENABLED = process.env.ENABLE_TEST_OUTBOX === "true";

export type OutboxMessage = {
  to: string;
  subject: string;
  kind: string;
  /** The actionable link in the e-mail (e.g. the invite accept URL), if any. */
  url?: string;
  /**
   * The one-time code, for e-mails whose action is a code rather than a link
   * (account verification, password reset). Same reason the invite URL is here:
   * a code is never persisted in a readable form, so an end-to-end test that has
   * to complete a real sign-up cannot get it any other way. Behind the same
   * `ENABLE_TEST_OUTBOX` gate, which is never set in production.
   */
  code?: string;
  at: string;
};

const store: OutboxMessage[] = [];

/** Records a message when the outbox is enabled; a no-op otherwise. */
export function captureOutbox(message: Omit<OutboxMessage, "at">): void {
  if (!TEST_OUTBOX_ENABLED) return;
  store.push({ ...message, at: new Date().toISOString() });
}

/** All captured messages, newest last. */
export function readOutbox(): OutboxMessage[] {
  return store;
}

/** Empties the outbox (used to isolate test cases). */
export function clearOutbox(): void {
  store.length = 0;
}
