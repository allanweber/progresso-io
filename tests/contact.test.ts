// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public contact form's bot defence.
 *
 * Worth unit-testing rather than leaving to e2e for one reason: a trap that
 * fires answers with the same "Mensagem enviada!" screen a real visitor gets,
 * so on-screen behaviour cannot distinguish "delivered" from "silently
 * dropped". These assert the thing that actually differs — whether the e-mail
 * was sent — and they pin the false-positive side too: a slow, honest human
 * must always get through.
 */

const sendContactEmail = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendContactEmail }));
// Turnstile is stubbed per test: the real module reads a secret from the
// environment and would reach out to Cloudflare.
const verifyTurnstile = vi.fn(async () => true);
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile }));
// The action asks for the caller's IP; `next/headers` needs a request scope.
vi.mock("@/server/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/rate-limit")>()),
  clientIp: async () => "203.0.113.7",
}));

const { sendContactMessage } = await import("@/app/actions/contact");
const { CONTACT_LIMITS } = await import("@/lib/contact");
const { __resetRateLimit } = await import("@/server/rate-limit");

/** A submission a real visitor would produce, with overrides per test. */
function submission(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "Maria Teste");
  form.set("email", "maria@example.com");
  form.set("message", "Olá, gostaria de saber mais sobre os planos.");
  // Filled in unhurried, a few seconds ago.
  form.set("renderedAt", String(Date.now() - 30_000));
  for (const [k, v] of Object.entries(overrides)) form.set(k, v);
  return form;
}

describe("sendContactMessage: bot defence", () => {
  beforeEach(() => {
    __resetRateLimit();
    sendContactEmail.mockClear();
    verifyTurnstile.mockClear();
    verifyTurnstile.mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends a genuine message", async () => {
    await expect(sendContactMessage(undefined, submission())).resolves.toEqual({
      ok: true,
    });
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("drops a submission that filled the honeypot, without saying so", async () => {
    const state = await sendContactMessage(
      undefined,
      submission({ website: "https://spam.example" }),
    );
    // Reported as success on purpose: a bot told "recusado" retunes and retries.
    expect(state).toEqual({ ok: true });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("drops a submission returned faster than a human could type it", async () => {
    const state = await sendContactMessage(
      undefined,
      submission({ renderedAt: String(Date.now() - 200) }),
    );
    expect(state).toEqual({ ok: true });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("drops a stale form — a tab left open for a day, or a replayed POST", async () => {
    const state = await sendContactMessage(
      undefined,
      submission({ renderedAt: String(Date.now() - 13 * 60 * 60_000) }),
    );
    expect(state).toEqual({ ok: true });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("still sends when no timestamp arrives at all", async () => {
    // Scripting off: the field is never stamped. The timing check is skipped
    // rather than the visitor being silently discarded.
    const form = submission();
    form.delete("renderedAt");
    await expect(sendContactMessage(undefined, form)).resolves.toEqual({
      ok: true,
    });
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("still sends when the honeypot is present but empty", async () => {
    // What every real browser posts: the field exists in the form, untouched.
    await expect(
      sendContactMessage(undefined, submission({ website: "" })),
    ).resolves.toEqual({ ok: true });
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("still validates the real fields first", async () => {
    const state = await sendContactMessage(undefined, submission({ message: "curta" }));
    expect(state?.fieldErrors?.message).toBeTruthy();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});

describe("sendContactMessage: one per IP per day", () => {
  beforeEach(() => {
    __resetRateLimit();
    sendContactEmail.mockClear();
    verifyTurnstile.mockClear();
    verifyTurnstile.mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("refuses the second message from the same IP", async () => {
    await expect(sendContactMessage(undefined, submission())).resolves.toEqual({
      ok: true,
    });

    const second = await sendContactMessage(undefined, submission());
    // Said out loud, and it names the wait: the most likely person to meet this
    // is a real visitor sharing an office or carrier NAT, not a spammer.
    expect(second?.formError).toMatch(/24 horas/);
    expect(second?.ok).toBeUndefined();
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("lets the same IP through again once the window elapses", async () => {
    await sendContactMessage(undefined, submission());
    expect(sendContactEmail).toHaveBeenCalledTimes(1);

    // Fixed window: 24h after the FIRST message, not at midnight.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1_000);
    try {
      // `renderedAt` is stamped against the same clock, so build it here.
      const form = new FormData();
      form.set("name", "Maria Teste");
      form.set("email", "maria@example.com");
      form.set("message", "Olá, gostaria de saber mais sobre os planos.");
      form.set("renderedAt", String(Date.now() - 30_000));
      await expect(sendContactMessage(undefined, form)).resolves.toEqual({
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
    expect(sendContactEmail).toHaveBeenCalledTimes(2);
  });
});

describe("sendContactMessage: field limits", () => {
  beforeEach(() => {
    __resetRateLimit();
    sendContactEmail.mockClear();
    verifyTurnstile.mockClear();
    verifyTurnstile.mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  // The form sets `maxLength` from the same constants, but that attribute lives
  // in the visitor's browser — it is not a limit, it is a courtesy. These
  // assert the half that an oversized POST actually meets.
  it.each([
    ["name", "n"],
    ["email", "e"],
    ["message", "m"],
  ])("refuses %s over its limit", async (field, filler) => {
    const over =
      field === "email"
        ? `${"a".repeat(CONTACT_LIMITS.email)}@example.com`
        : filler.repeat(CONTACT_LIMITS[field as "name" | "message"] + 1);

    const state = await sendContactMessage(undefined, submission({ [field]: over }));
    expect(state?.fieldErrors?.[field]).toBeTruthy();
    expect(state?.ok).toBeUndefined();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("accepts each field at exactly its limit", async () => {
    const state = await sendContactMessage(
      undefined,
      submission({
        name: "n".repeat(CONTACT_LIMITS.name),
        message: "m".repeat(CONTACT_LIMITS.message),
      }),
    );
    expect(state).toEqual({ ok: true });
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });
});

describe("sendContactMessage: Turnstile", () => {
  beforeEach(() => {
    __resetRateLimit();
    sendContactEmail.mockClear();
    verifyTurnstile.mockClear();
    verifyTurnstile.mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it("passes the widget token and the caller's IP to the verifier", async () => {
    await sendContactMessage(
      undefined,
      submission({ "cf-turnstile-response": "token-abc" }),
    );
    expect(verifyTurnstile).toHaveBeenCalledWith("token-abc", "203.0.113.7");
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses out loud when the challenge fails", async () => {
    verifyTurnstile.mockResolvedValue(false);
    const state = await sendContactMessage(
      undefined,
      submission({ "cf-turnstile-response": "expired" }),
    );
    // Unlike the honeypot, this one says so: a real visitor whose challenge
    // timed out has to be told to solve it again, not shown a false success.
    expect(state?.formError).toMatch(/robô/);
    expect(state?.ok).toBeUndefined();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it("checks the honeypot before spending a call on Cloudflare", async () => {
    await sendContactMessage(
      undefined,
      submission({ website: "https://spam.example" }),
    );
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});
