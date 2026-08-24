// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook is a public, unauthenticated POST. Its only defence is the
 * provider port's `verifyWebhook`, checked against the RAW body before anything
 * is parsed. These tests pin that order: an unverified request must never reach
 * `parseInboundWebhook`, and `verifyWebhook` must see the exact bytes sent (a
 * vendor HMAC over a re-serialized body would mismatch every time).
 */

const verifyWebhook = vi.fn<(rawBody: string, headers: Headers) => boolean>(
  () => true,
);
const parseInboundWebhook = vi.fn(() => []);
vi.mock("@/lib/whatsapp-provider", () => ({
  getWhatsAppProvider: () => ({
    name: "test",
    canDeliver: false,
    sendSessionMessage: vi.fn(),
    sendTemplateMessage: vi.fn(),
    parseInboundWebhook,
    verifyWebhook,
  }),
}));

import * as route from "@/app/api/whatsapp/webhook/route";

const post = (body: string) =>
  new Request("http://localhost/api/whatsapp/webhook", {
    method: "POST",
    body,
  });

const get = (params: Record<string, string>) =>
  new Request(
    `http://localhost/api/whatsapp/webhook?${new URLSearchParams(params)}`,
  );

beforeEach(() => {
  verifyWebhook.mockClear().mockReturnValue(true);
  parseInboundWebhook.mockClear().mockReturnValue([]);
});

describe("POST /api/whatsapp/webhook", () => {
  it("accepts a verified payload", async () => {
    const res = await route.POST(post('{"a":1}'), undefined as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(parseInboundWebhook).toHaveBeenCalledWith({ a: 1 });
  });

  it("rejects an unverified payload without parsing it", async () => {
    verifyWebhook.mockReturnValue(false);

    const res = await route.POST(post('{"a":1}'), undefined as never);

    expect(res.status).toBe(403);
    expect(parseInboundWebhook).not.toHaveBeenCalled();
  });

  it("hands verifyWebhook the raw body text, not a parsed object", async () => {
    await route.POST(post('{"a":1}'), undefined as never);

    expect(verifyWebhook).toHaveBeenCalledTimes(1);
    expect(verifyWebhook.mock.calls[0][0]).toBe('{"a":1}');
  });

  it("answers 200 to a verified but unparseable body", async () => {
    const res = await route.POST(post("not json"), undefined as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(parseInboundWebhook).not.toHaveBeenCalled();
  });
});

describe("GET /api/whatsapp/webhook (Meta handshake)", () => {
  const previous = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  beforeEach(() => {
    // A fixture, not a secret — the real token lives only in the environment.
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-token";
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = previous;
  });

  it("echoes the challenge when the token matches", async () => {
    const res = await route.GET(
      get({ "hub.verify_token": "test-token", "hub.challenge": "42" }),
      undefined as never,
    );

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("42");
  });

  it("rejects a wrong token of the same length", async () => {
    const res = await route.GET(
      get({ "hub.verify_token": "test-tokeN", "hub.challenge": "42" }),
      undefined as never,
    );

    expect(res.status).toBe(403);
  });

  it("rejects a token of a different length without throwing", async () => {
    const res = await route.GET(
      get({ "hub.verify_token": "short", "hub.challenge": "42" }),
      undefined as never,
    );

    expect(res.status).toBe(403);
  });
});
