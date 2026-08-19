import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Reading the test outbox safely under `fullyParallel`.
 *
 * **It is ONE in-process array shared by the whole server**, and it captures
 * both e-mail and WhatsApp — every spec that sends anything writes into the
 * same store, concurrently, against a single Playwright `webServer`. That makes
 * the obvious pattern — `DELETE /api/test/outbox`, act, then read everything —
 * quietly wrong in two ways at once:
 *
 * - **Another spec's clear wipes your message.** A `DELETE` from any parallel
 *   test between your action and your read empties the array, and the assertion
 *   fails as though the message never existed. This is what made
 *   `students.spec.ts` flaky.
 * - **Another spec's message looks like yours.** A bare
 *   `messages.some(m => m.kind === "invite")` matches an invite some *other*
 *   test sent — which turns a negative assertion ("no invite yet") into a coin
 *   flip that happens to keep landing heads.
 *
 * Both disappear if no test ever clears and every test filters by the unique
 * recipient it already generates. So **do not add a `DELETE` back**: isolation
 * comes from the address, not from emptying a store others are still using.
 *
 * These also poll rather than read once, because a message is sent after the
 * response the test awaited — an immediate read can beat the send.
 */

export type OutboxMessage = {
  to: string;
  subject: string;
  kind: string;
  url?: string;
  at: string;
};

/**
 * Whether a captured recipient is the one the test asked about.
 *
 * Phones cannot be compared literally. A spec registers `11 91234-5678` and the
 * app stores what `normalizePhone` produced — `5511912345678` — so an exact
 * match silently never fires, and the test fails claiming the message was never
 * sent. Digits-only with a suffix match spans both forms, and the DDD+number
 * tail is unique enough for a test fixture.
 *
 * E-mails are compared exactly (case-insensitively): a suffix rule there would
 * happily match `maria@example.com` against `ana-maria@example.com`.
 */
function matchesRecipient(actual: string, wanted: string): boolean {
  if (wanted.includes("@") || actual.includes("@")) {
    return actual.toLowerCase() === wanted.toLowerCase();
  }
  const a = actual.replace(/\D/g, "");
  const w = wanted.replace(/\D/g, "");
  return a !== "" && w !== "" && (a.endsWith(w) || w.endsWith(a));
}

/** Every captured message for `to` (e-mail address or phone), newest last. */
export async function outboxFor(
  request: APIRequestContext,
  to: string,
): Promise<OutboxMessage[]> {
  const res = await request.get("/api/test/outbox");
  const { messages } = (await res.json()) as { messages: OutboxMessage[] };
  return messages.filter((m) => matchesRecipient(m.to, to));
}

/**
 * Waits for one `kind` of message to `to`, and returns it.
 *
 * `to` is whatever the channel addresses: the e-mail address for mail, the
 * phone for WhatsApp. Getting that wrong is the likeliest reason this times
 * out — `anamnesis_fill`, for instance, is a WhatsApp template and is keyed by
 * phone, not by the address the same student was registered with.
 *
 * Fails with the recipient's actual message kinds listed, rather than the bare
 * `expected true, received false` a hand-rolled `.some()` produces.
 */
export async function waitForMessage(
  request: APIRequestContext,
  to: string,
  kind: string,
): Promise<OutboxMessage> {
  await expect
    .poll(async () => (await outboxFor(request, to)).map((m) => m.kind), {
      message: `waiting for a "${kind}" message to ${to}`,
    })
    .toContain(kind);

  const found = (await outboxFor(request, to)).find((m) => m.kind === kind);
  return found!;
}

/**
 * Asserts no `kind` message has reached `to`.
 *
 * Deliberately a plain read, not a poll: proving a negative by waiting only
 * makes the suite slower without making it any more certain. Pair it with a
 * positive `waitForMessage` first — once what *should* have been sent has
 * arrived, what should not have been sent has had its chance too.
 */
export async function expectNoMessage(
  request: APIRequestContext,
  to: string,
  kind: string,
): Promise<void> {
  const kinds = (await outboxFor(request, to)).map((m) => m.kind);
  expect(kinds).not.toContain(kind);
}
