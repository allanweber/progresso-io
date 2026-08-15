import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "./src/lib/sentry-scrub";

/**
 * Sentry init for the Edge runtime (middleware, edge routes). Loaded once at
 * startup by `src/instrumentation.ts`'s `register()`. A no-op when no DSN is
 * configured. No Session Replay here — that lives only in the browser SDK.
 */

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});
