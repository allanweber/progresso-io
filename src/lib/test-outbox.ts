/**
 * Test-only in-memory e-mail outbox. Because invite tokens are stored hashed,
 * an end-to-end test can't reconstruct the emailed link from the database — so,
 * ONLY when `ENABLE_TEST_OUTBOX=true`, outgoing invite e-mails are also captured
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
