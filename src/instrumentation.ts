import type { Instrumentation } from "next";

import { logger } from "@/server/observability";

/**
 * Next.js instrumentation hooks (see the app/instrumentation docs). `register`
 * runs once per server instance at startup; `onRequestError` is Next's global
 * catch for server-side errors — including those thrown during RSC/page render
 * or in Server Actions, which the route/action wrappers never see. Together
 * they guarantee no server error goes unlogged.
 */

export function register(): void {
  logger.info("server.start", {
    runtime: process.env.NEXT_RUNTIME,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
  });
}

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;

  logger.error("request.unhandled", {
    err,
    digest,
    method: request.method,
    path: request.path,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
