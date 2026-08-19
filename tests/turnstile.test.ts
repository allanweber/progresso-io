// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cloudflare Turnstile verification, the visible half of the contact form's bot
 * check.
 *
 * The secret is read at module load, so every case re-imports the module under
 * a different environment — `vi.resetModules()` between tests is what makes
 * "configured" and "not configured" separable at all.
 *
 * The two paths worth pinning hardest are the ones that return `true` without
 * asking Cloudflare anything: unset keys, and Cloudflare being unreachable.
 * Both are deliberate — a check that cannot run must not become a wall in front
 * of the contact form — and both are the kind of decision a later refactor
 * silently inverts into "refuse everything".
 */

const SECRET = "1x0000000000000000000000000000000AA";

async function loadTurnstile(secret?: string) {
  vi.resetModules();
  if (secret === undefined) vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  else vi.stubEnv("TURNSTILE_SECRET_KEY", secret);
  return import("@/lib/turnstile");
}

/** Cloudflare's siteverify reply, as the real endpoint shapes it. */
function siteVerify(success: boolean, codes?: string[]) {
  return {
    ok: true,
    json: async () => ({ success, "error-codes": codes }),
  } as unknown as Response;
}

describe("verifyTurnstile", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("passes without calling Cloudflare when no secret is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { verifyTurnstile, isTurnstileConfigured } = await loadTurnstile();

    expect(isTurnstileConfigured()).toBe(false);
    // Skipped, not refused: this is how dev and e2e run, and how an install
    // that never set the keys keeps a working contact form.
    await expect(verifyTurnstile(undefined)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a missing token once the widget is live", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { verifyTurnstile } = await loadTurnstile(SECRET);

    // No token with a configured widget means the challenge was never solved —
    // or something posted straight to the action without loading the page.
    await expect(verifyTurnstile(undefined)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare confirms, and forwards the secret and IP", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerify(true));
    const { verifyTurnstile } = await loadTurnstile(SECRET);

    await expect(verifyTurnstile("token-abc", "203.0.113.7")).resolves.toBe(true);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("challenges.cloudflare.com");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("token-abc");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("omits remoteip when the caller has no IP", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(siteVerify(true));
    const { verifyTurnstile } = await loadTurnstile(SECRET);

    await verifyTurnstile("token-abc");
    const body = (fetchSpy.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(body.has("remoteip")).toBe(false);
  });

  it("refuses a token Cloudflare rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteVerify(false, ["invalid-input-response"]),
    );
    const { verifyTurnstile } = await loadTurnstile(SECRET);

    await expect(verifyTurnstile("forged")).resolves.toBe(false);
  });

  it("fails OPEN when Cloudflare is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ETIMEDOUT"));
    const { verifyTurnstile } = await loadTurnstile(SECRET);

    // Deliberate: during a Cloudflare outage, refusing every message is a worse
    // failure than letting spam through for a few minutes — and the honeypot
    // and fill clock are still standing.
    await expect(verifyTurnstile("token-abc")).resolves.toBe(true);
  });
});
