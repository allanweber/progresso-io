import * as Sentry from "@sentry/nextjs";

import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * Browser Sentry init (Next's `instrumentation-client` convention, v15.3+). Runs
 * after the document loads and before hydration. A no-op when no DSN is set.
 *
 * Session Replay is deliberately conservative for a health app under LGPD:
 * everything is masked (text, inputs, media), and sessions are only recorded
 * around errors — never continuously — which also keeps us inside the free
 * ~50-replays/month quota.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  sendDefaultPii: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: dsn ? 1 : 0,
  integrations: dsn
    ? [
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ]
    : [],
  beforeSend: scrubEvent,
});

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
