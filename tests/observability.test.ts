// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  getRequestContext,
  newRequestId,
  runWithRequestContext,
} from "@/server/observability/context";
import { withRoute } from "@/server/observability/route";

/**
 * The structured JSON logger was replaced by Sentry + plain console. What
 * remains of the observability layer is the request-context plumbing and the
 * `withRoute` safety net (request-id correlation + crash→500). Sentry itself is
 * a no-op here (no DSN), so `withRoute`'s error path exercises cleanly.
 */

function req(headers?: HeadersInit): Request {
  return new Request("http://localhost/api/health", { headers });
}

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

describe("withRoute", () => {
  it("echoes a fresh x-request-id on a normal response", async () => {
    const GET = withRoute("demo", async () => new Response("ok"));
    const res = await GET(req(), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("reuses an incoming x-request-id for correlation", async () => {
    const GET = withRoute("demo", async () => new Response("ok"));
    const res = await GET(req({ "x-request-id": "req-123" }), undefined);
    expect(res.headers.get("x-request-id")).toBe("req-123");
  });

  it("converts an uncaught throw into a 500 (still tagged with the id)", async () => {
    const GET = withRoute("demo", async () => {
      throw new Error("boom");
    });
    const res = await GET(req({ "x-request-id": "req-err" }), undefined);
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("req-err");
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Erro interno");
  });
});
