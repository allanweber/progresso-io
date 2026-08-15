# Observability

Error tracking runs on **[Sentry](https://sentry.io)** (`@sentry/nextjs`), with
plain **`console`** logging for local/stdout visibility. The previous
structured-JSON-logs-to-stdout system was removed in favour of Sentry as the
error backend; what remains of the in-app layer is a thin request wrapper that
provides a correlation id and a crash→500 safety net.

## Sentry

Wired for all three products, activated by the DSN env vars (a **no-op** when
unset, so local dev and DSN-less builds are unaffected — mirrors GA/Resend/R2):

| Concern | Where | Notes |
| ------- | ----- | ----- |
| Browser SDK | `src/instrumentation-client.ts` | errors + tracing + Session Replay |
| Node server SDK | `sentry.server.config.ts` | loaded by `register()` |
| Edge SDK | `sentry.edge.config.ts` | loaded by `register()` |
| Server error catch | `src/instrumentation.ts` → `onRequestError` | `Sentry.captureRequestError` + `console.error` |
| Root error boundary | `src/app/global-error.tsx` | `Sentry.captureException` |
| Route/action throws | `src/server/observability/route.ts` | `withRoute`/`withAction` capture + re-shape to 500 |
| PII scrub | `src/lib/sentry-scrub.ts` (`beforeSend`) | see below |
| Build integration | `next.config.ts` → `withSentryConfig` | source-map upload (gated) |

**Sampling & replay.** `tracesSampleRate` is `0.1` in production and `0` in dev.
Session Replay is **masked** (`maskAllText` + `maskAllInputs` + `blockAllMedia`)
and **on-error only** (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate:
1`) — nothing is recorded continuously, which suits a health app under LGPD and
stays inside the free replay quota.

**Data region.** Use an **EU (Frankfurt, `*.ingest.de.sentry.io`)** DSN. Sentry
SaaS has no Brazil region; EU is LGPD-fine via DPA/adequacy. For hard in-country
residency, self-hosting GlitchTip (Sentry-SDK compatible) is a **DSN swap** — no
code change. See `docs/growth-roadmap.md`.

**LGPD / secrets.** `sendDefaultPii: false` keeps the SDK from attaching IPs,
cookies and headers. `scrubEvent` (`beforeSend`, browser + server) is a
belt-and-suspenders backstop: it drops request cookies/headers/query-string
wholesale and masks sensitive keys (`password`, `token`, `authorization`,
`email`, `phone`, `whatsapp`, `first_name`, `cpf`, …) at any depth in request
data / `extra` / `contexts`. Tenant identity is attached as **opaque UUIDs**
(`Sentry.setUser({ id })` + `clinicId`/`role` tags) from `enrichRequestContext` —
not personal data, so "which clinic hit this bug" is answerable.

### Config (env)

Set on both the app and the build (see `.env.example` → "Sentry"):

- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` — the DSN (publishable). When unset,
  Sentry is a no-op and the CSP stays tight (the ingest host + replay
  `worker-src blob:` are only added when the DSN is configured).
- `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` — source-map upload at
  build time. Optional: a build without the auth token still succeeds and just
  skips the upload.

## Console logging

`logger` (`src/server/observability/logger.ts`) is a thin `console` shim keeping
the `logger.info/warn/error/debug` surface, so existing call sites (business
events like `student.created`, `invite.sent`, `email.sent`…) are unchanged. No
JSON envelope, no redaction, no context-merge — just leveled console lines.
Verbosity is gated by `LOG_LEVEL` (`debug`|`info`|`warn`|`error`; default `info`
in production, `debug` otherwise), wired through `docker-compose.yml` and
settable in the Dokploy Environment tab. Credentials/PII are still never passed
to it by call sites (the one exception is the **dev-only** OTP e-mail fallback,
active solely when `RESEND_API_KEY` is unset).

## Request wrapper

`withRoute` (API routes) and `withAction` (server actions) in
`src/server/observability/route.ts` open an
[`AsyncLocalStorage`](https://nodejs.org/api/async_context.html) request context
and:

- assign a `requestId` (from an incoming `x-request-id` or fresh) and echo it on
  the `x-request-id` response header, so a client error can be tied to a Sentry
  event;
- on an uncaught throw, report to Sentry + `console.error` and convert it to a
  clean **500** (`{ error: "Erro interno no servidor." }`) so a handler bug can't
  leak a stack to the client. `withAction` re-throws instead (preserving Next's
  redirect/notFound control flow); Sentry's Dedupe drops any duplicate that
  `onRequestError` also captures.

Tenant identity (`userId`/`clinicId`/`role`) is attached to the Sentry scope once
the session is resolved (`requireClinic` / `getTenantContext` / `getAdminSession`
→ `enrichRequestContext`).

## Health checks

- `GET /api/health` — liveness. `{ "status": "ok" }`, no DB touch. Used by the
  compose `healthcheck`.
- `GET /api/health?deep=1` — readiness. Pings the database and reports
  `db.latencyMs`; returns **503** when the DB is unreachable, so an orchestrator
  or uptime monitor can react.

Uptime itself is watched **externally** (BetterStack / UptimeRobot) so an alert
still fires when the box is down — an in-app monitor can't. Not yet wired
(external signup only); see `docs/growth-roadmap.md`.
