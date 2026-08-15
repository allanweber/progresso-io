import { describe, expect, it } from "vitest";

import { scrubEvent } from "@/lib/sentry-scrub";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * The Sentry `beforeSend` backstop: strips credentials/PII before an event
 * leaves the process (LGPD). `sendDefaultPii: false` already omits most of this;
 * these tests pin the belt-and-suspenders scrub.
 */

describe("scrubEvent", () => {
  it("drops request cookies, headers and query string wholesale", () => {
    const event = {
      request: {
        cookies: { session: "abc" },
        headers: { authorization: "Bearer x" },
        query_string: "token=secret",
        data: { keep: "yes" },
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect((out.request?.data as Record<string, unknown>).keep).toBe("yes");
  });

  it("masks sensitive keys in request data at any depth", () => {
    const event = {
      request: {
        data: {
          email: "a@b.com",
          nested: { password: "x", firstName: "Ana", ok: 1 },
        },
      },
    } as unknown as ErrorEvent;

    const data = scrubEvent(event).request?.data as Record<string, unknown>;
    expect(data.email).toBe("[redacted]");
    const nested = data.nested as Record<string, unknown>;
    expect(nested.password).toBe("[redacted]");
    expect(nested.firstName).toBe("[redacted]");
    expect(nested.ok).toBe(1);
  });

  it("masks sensitive keys inside extra", () => {
    const event = {
      extra: { whatsapp: "5511999999999", note: "fine" },
    } as unknown as ErrorEvent;

    const extra = scrubEvent(event).extra as Record<string, unknown>;
    expect(extra.whatsapp).toBe("[redacted]");
    expect(extra.note).toBe("fine");
  });

  it("passes a bare event through untouched", () => {
    const event = { message: "hello" } as unknown as ErrorEvent;
    expect(scrubEvent(event).message).toBe("hello");
  });
});
