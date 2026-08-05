import { apiError } from "@/server/api";
import { newRequestId, runWithRequestContext } from "./context";
import { logger } from "./logger";

/**
 * Wrappers that give every request one correlated log trail: a `*.start` line,
 * a `*.finish` line carrying status + duration (the source of latency/throughput
 * metrics), and an `*.error` line with the stack on an uncaught throw. They also
 * open the AsyncLocalStorage context every other log line reads from.
 */

/** True for Next's control-flow throws (redirect / notFound) — not real errors. */
function isControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_HTTP_ERROR_FALLBACK;404")
  );
}

type RouteHandler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response> | Response;

type RouteOptions = {
  /**
   * Silence the routine `request.start`/`request.finish` lines for a
   * high-frequency probe (e.g. the healthcheck an orchestrator hits every few
   * seconds), which would otherwise bury real events. Nothing abnormal is lost:
   * a thrown error is still logged at `error`, and any 4xx/5xx response is
   * bumped to `warn`, so a healthy 200 is the only thing that stays quiet.
   */
  quiet?: boolean;
};

/**
 * Wraps a route handler: opens a request context (request id from the incoming
 * `x-request-id` or a fresh one), logs start/finish/error with timing, echoes
 * the id back on `x-request-id`, and converts an uncaught throw into a 500 so a
 * handler bug can't leak a stack to the client.
 *
 *   export const GET = withRoute("students.list", async (request) => { … });
 */
export function withRoute<Ctx = unknown>(
  name: string,
  handler: RouteHandler<Ctx>,
  options: RouteOptions = {},
): RouteHandler<Ctx> {
  return async (request, ctx) => {
    const requestId = request.headers.get("x-request-id") ?? newRequestId();
    const path = new URL(request.url).pathname;
    const start = performance.now();

    return runWithRequestContext(
      { requestId, method: request.method, route: name, path },
      async () => {
        logger.debug("request.start");
        try {
          const res = await handler(request, ctx);
          const durationMs = Math.round(performance.now() - start);
          // A quiet route only speaks up when the response is not a success;
          // otherwise the routine finish line is dropped to keep probes silent.
          if (!options.quiet) {
            logger.info("request.finish", { status: res.status, durationMs });
          } else if (res.status >= 400) {
            logger.warn("request.finish", { status: res.status, durationMs });
          }
          res.headers.set("x-request-id", requestId);
          return res;
        } catch (error) {
          logger.error("request.error", {
            err: error,
            durationMs: Math.round(performance.now() - start),
          });
          const res = apiError("Erro interno no servidor.", 500);
          res.headers.set("x-request-id", requestId);
          return res;
        }
      },
    );
  };
}

/**
 * Wraps a server action so its work runs inside a request context with timing
 * and error logging. Next's redirect()/notFound() throw control-flow signals
 * that must propagate untouched — those are logged as a normal finish, only
 * genuine throws are logged as errors. The action's own return value (including
 * `ActionState` validation results) is returned unchanged.
 */
export function withAction<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const start = performance.now();
    return runWithRequestContext(
      { requestId: newRequestId(), method: "ACTION", route: name },
      async () => {
        try {
          const result = await fn(...args);
          logger.info("action.finish", {
            durationMs: Math.round(performance.now() - start),
          });
          return result;
        } catch (error) {
          if (isControlFlow(error)) {
            logger.info("action.finish", {
              durationMs: Math.round(performance.now() - start),
              redirected: true,
            });
          } else {
            logger.error("action.error", {
              err: error,
              durationMs: Math.round(performance.now() - start),
            });
          }
          throw error;
        }
      },
    );
  };
}
