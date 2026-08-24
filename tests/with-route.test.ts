// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * Regression: `withRoute` used to turn *every* throw into a 500 + Sentry event,
 * including Next's `redirect()` / `notFound()` control-flow signals. A handler
 * that redirected would have answered with `{"error":"Erro interno no
 * servidor."}` and filed a phantom exception. Cases 1 and 2 guard that; case 3
 * pins the genuine-error path that must keep behaving as before.
 */

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { withRoute } from "@/server/observability/route";

/** Next signals control flow by throwing an Error carrying a `digest`. */
function controlFlowError(digest: string): Error {
  return Object.assign(new Error("NEXT_CONTROL_FLOW"), { digest });
}

const req = (headers?: Record<string, string>) =>
  new Request("https://app.test/api/thing", { headers });

describe("withRoute", () => {
  it("re-throws a redirect() signal instead of answering 500", async () => {
    const signal = controlFlowError("NEXT_REDIRECT;replace;/login;307;");
    const handler = withRoute("test.redirect", async () => {
      throw signal;
    });

    await expect(handler(req(), undefined)).rejects.toBe(signal);
  });

  it("re-throws a notFound() signal instead of answering 500", async () => {
    const signal = controlFlowError("NEXT_HTTP_ERROR_FALLBACK;404");
    const handler = withRoute("test.not-found", async () => {
      throw signal;
    });

    await expect(handler(req(), undefined)).rejects.toBe(signal);
  });

  it("still converts a genuine throw into a 500", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withRoute("test.boom", async () => {
      throw new Error("boom");
    });

    const res = await handler(req(), undefined);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Erro interno no servidor.",
    });
    errorSpy.mockRestore();
  });

  it("echoes an incoming x-request-id back on the response", async () => {
    const handler = withRoute("test.ok", async () => new Response("ok"));

    const res = await handler(req({ "x-request-id": "abc-123" }), undefined);

    expect(res.headers.get("x-request-id")).toBe("abc-123");
  });
});
