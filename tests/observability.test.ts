// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/server/observability/logger";
import {
  enrichRequestContext,
  getRequestContext,
  newRequestId,
  runWithRequestContext,
} from "@/server/observability/context";

/**
 * The logger writes one JSON line per event via `console`. These tests capture
 * that line and assert the structured shape, level filtering, secret redaction,
 * error serialization, and request-context merging. LOG_LEVEL is forced to
 * debug (set before the logger module computed its threshold — see vitest env).
 */

type Captured = { method: "log" | "warn" | "error"; record: Record<string, unknown> };

let captured: Captured[];
let spies: Array<ReturnType<typeof vi.spyOn>>;

function lastRecord(): Record<string, unknown> {
  return captured[captured.length - 1].record;
}

beforeEach(() => {
  captured = [];
  const grab = (method: Captured["method"]) => (line: unknown) => {
    captured.push({ method, record: JSON.parse(String(line)) });
  };
  spies = [
    vi.spyOn(console, "log").mockImplementation(grab("log")),
    vi.spyOn(console, "warn").mockImplementation(grab("warn")),
    vi.spyOn(console, "error").mockImplementation(grab("error")),
  ];
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
});

describe("logger", () => {
  it("emits one JSON line with level, time and message", () => {
    logger.info("hello", { foo: "bar" });
    expect(captured).toHaveLength(1);
    const rec = lastRecord();
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.foo).toBe("bar");
    expect(typeof rec.time).toBe("string");
    expect(Number.isNaN(Date.parse(rec.time as string))).toBe(false);
  });

  it("routes levels to the matching console method", () => {
    logger.warn("careful");
    logger.error("boom");
    expect(captured[0].method).toBe("warn");
    expect(captured[1].method).toBe("error");
  });

  it("redacts sensitive keys at any depth", () => {
    logger.info("signup", {
      email: "a@b.com",
      password: "supersecret",
      nested: { token: "raw-token", tokenHash: "deadbeef", ok: true },
    });
    const rec = lastRecord();
    expect(rec.email).toBe("a@b.com"); // not sensitive
    expect(rec.password).toBe("[redacted]");
    const nested = rec.nested as Record<string, unknown>;
    expect(nested.token).toBe("[redacted]");
    expect(nested.tokenHash).toBe("[redacted]");
    expect(nested.ok).toBe(true);
  });

  it("serializes an Error passed as `err`", () => {
    logger.error("failed", { err: new TypeError("nope") });
    const err = lastRecord().err as Record<string, unknown>;
    expect(err.name).toBe("TypeError");
    expect(err.message).toBe("nope");
    expect(typeof err.stack).toBe("string");
  });

  it("merges request-scoped context into every line", () => {
    runWithRequestContext(
      { requestId: "req-1", method: "GET", route: "students.list" },
      () => {
        enrichRequestContext({ userId: "u-1", clinicId: "c-1", role: "coach" });
        logger.info("request.finish", { status: 200 });
      },
    );
    const rec = lastRecord();
    expect(rec.requestId).toBe("req-1");
    expect(rec.route).toBe("students.list");
    expect(rec.userId).toBe("u-1");
    expect(rec.clinicId).toBe("c-1");
    expect(rec.role).toBe("coach");
    expect(rec.status).toBe(200);
  });

  it("omits request fields when there is no active context", () => {
    logger.info("standalone");
    const rec = lastRecord();
    expect("requestId" in rec).toBe(false);
    expect("userId" in rec).toBe(false);
  });
});

describe("request context", () => {
  it("newRequestId returns a non-empty unique id", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("getRequestContext is undefined outside a run scope", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("isolates context between concurrent runs", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithRequestContext({ requestId: "A" }, async () => {
        await Promise.resolve();
        seen.push(getRequestContext()!.requestId);
      }),
      runWithRequestContext({ requestId: "B" }, async () => {
        await Promise.resolve();
        seen.push(getRequestContext()!.requestId);
      }),
    ]);
    expect(seen.sort()).toEqual(["A", "B"]);
  });
});
