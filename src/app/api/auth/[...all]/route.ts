import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import { withRoute } from "@/server/observability";

/**
 * Better Auth's catch-all handler, wrapped so every auth call (sign-in,
 * sign-up, OTP, OAuth callbacks) gets the same request-scoped logging — timing,
 * status and a correlation id — as the rest of the API. Better Auth's own
 * behavior and headers are untouched; the wrapper only observes.
 */
const handlers = toNextJsHandler(auth);

export const GET = withRoute("auth", handlers.GET);
export const POST = withRoute("auth", handlers.POST);
