import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hooks. `register` loads the Sentry SDK for the active
 * server runtime (Node or Edge). `onRequestError` is Next's global catch for
 * server-side errors — including those thrown during RSC/page render or in
 * Server Actions, which the route/action wrappers never see — so no server error
 * goes unreported: we log it to the console and forward it to Sentry.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  console.error("request.error", {
    method: request.method,
    path: request.path,
    err,
  });
  Sentry.captureRequestError(err, request, context);
};
