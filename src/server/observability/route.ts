import * as Sentry from "@sentry/nextjs";

import { apiError } from "@/server/api";
import { newRequestId, runWithRequestContext } from "./context";

/**
 * Wrappers that give every request a correlation id and a safety net. They open
 * the AsyncLocalStorage context (so the tenant identity attached later reaches
 * Sentry), echo `x-request-id`, convert an uncaught throw into a 500 so a handler
 * bug can't leak a stack to the client, and report the error to Sentry +
 * `console.error`. Routine start/finish logging was removed with the structured
 * logger — Sentry owns request/latency telemetry now.
 */

/** True for Next's control-flow throws (redirect / notFound) — not real errors. */
function isControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_HTTP_ERROR_FALLBACK;404")
  );
}

export type RouteHandler<Ctx> = (
  request: Request,
  ctx: Ctx,
) => Promise<Response> | Response;

/**
 * Wraps a route handler: opens a request context (request id from the incoming
 * `x-request-id` or a fresh one), echoes the id back on `x-request-id`, and
 * converts an uncaught throw into a 500 (reported to Sentry + console) so a
 * handler bug can't leak a stack to the client. Next's redirect()/notFound()
 * control-flow throws are re-thrown untouched.
 *
 *   export const GET = withRoute("students.list", async (request) => { … });
 */
export function withRoute<Ctx = unknown>(
  name: string,
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (request, ctx) => {
    const requestId = request.headers.get("x-request-id") ?? newRequestId();
    const path = new URL(request.url).pathname;

    return runWithRequestContext(
      { requestId, method: request.method, route: name, path },
      async () => {
        try {
          const res = await handler(request, ctx);
          res.headers.set("x-request-id", requestId);
          return res;
        } catch (error) {
          // Next's redirect()/notFound() are control flow, not failures — they
          // must propagate so the framework can act on them. Swallowing them
          // here would answer a redirect with a 500 and file a phantom Sentry
          // event (withAction has always done this; withRoute had not).
          if (isControlFlow(error)) throw error;
          console.error("request.error", { route: name, path, err: error });
          Sentry.captureException(error);
          const res = apiError("Erro interno no servidor.", 500);
          res.headers.set("x-request-id", requestId);
          return res;
        }
      },
    );
  };
}

/**
 * Wraps a server action so its work runs inside a request context. Next's
 * redirect()/notFound() throw control-flow signals that must propagate
 * untouched — those are re-thrown without reporting; genuine throws are reported
 * to Sentry + console and re-thrown (Sentry's Dedupe drops any duplicate that
 * Next's onRequestError also captures). The action's own return value is
 * returned unchanged.
 */
export function withAction<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    return runWithRequestContext(
      { requestId: newRequestId(), method: "ACTION", route: name },
      async () => {
        try {
          return await fn(...args);
        } catch (error) {
          if (!isControlFlow(error)) {
            console.error("action.error", { action: name, err: error });
            Sentry.captureException(error);
          }
          throw error;
        }
      },
    );
  };
}
