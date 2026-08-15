import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./src/lib/sentry-scrub";

/**
 * Sentry init for the Node.js server runtime. Loaded once at startup by
 * `src/instrumentation.ts`'s `register()`. A no-op when no DSN is configured, so
 * builds and local dev without Sentry are unaffected (mirrors GA/Resend/R2).
 */

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  // Keep spans well inside the free-tier quota; silent in dev.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  // LGPD: never attach IPs/cookies/headers by default. `scrubEvent` is a second
  // backstop for anything that reaches request data / extra / contexts.
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
