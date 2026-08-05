# Observability

The app emits **structured JSON logs to stdout** — one line per event. That's
the whole transport: Docker (→ Dokploy) captures the stream, and any aggregator
(Grafana Loki, CloudWatch, Datadog, …) can ingest it later with zero code
changes. There is no vendor SDK and no metrics backend to run; metrics are
derived from the logs for now (see [Metrics](#metrics-from-logs)).

## What gets logged

Every server request and action produces a correlated trail:

| Event            | When                                   | Key fields                          |
| ---------------- | -------------------------------------- | ----------------------------------- |
| `server.start`   | once per server instance at startup    | `runtime`, `nodeEnv`, `logLevel`    |
| `request.start`  | an API route begins (debug)            | `requestId`, `method`, `route`, `path` |
| `request.finish` | an API route returns                   | `status`, `durationMs`              |
| `request.error`  | an API route throws (→ 500)            | `err`, `durationMs`                 |
| `request.unhandled` | any server error Next catches globally | `err`, `digest`, `routeType`, `routePath` |
| `action.finish`  | a server action returns/redirects      | `durationMs`, `redirected?`         |
| `action.error`   | a server action throws                 | `err`, `durationMs`                 |

Plus **business events**, e.g. `student.created`, `student.archived`,
`student.hard_deleted` (warn — irreversible), `invite.sent`, `invite.accepted`,
`auth.signup.ok`, `auth.signin.ok` / `auth.signin.failed`, `auth.verify.ok`,
`auth.password_reset.ok`, `email.sent` / `email.send_failed`.

### Correlation and tenant context

Each request opens an [`AsyncLocalStorage`](https://nodejs.org/api/async_context.html)
context, so **every** log line inside it automatically carries:

- `requestId` — one id per request (also returned on the `x-request-id`
  response header, so a client error can be tied to server logs).
- `method`, `route` (a stable logical name like `students.list`), `path`.
- `userId`, `clinicId`, `role` — attached as soon as the session is resolved
  (`requireClinic` / `getTenantContext` / `getAdminSession`).

Call sites only pass what's specific to the event; the shared fields are merged
in for free.

## Levels

Set with `LOG_LEVEL` (`debug` | `info` | `warn` | `error`). Default: `info` in
production, `debug` otherwise. It's wired through `docker-compose.yml`
(`LOG_LEVEL=${LOG_LEVEL:-info}`) and settable in the Dokploy Environment tab.

## Secrets are never logged

`logger` deep-redacts sensitive keys at any depth (`password`, `otp`, `token`,
`token_hash`, `secret`, `authorization`, `cookie`, `*_token`, `database_url`,
provider secrets, …), replacing the value with `[redacted]`. Redaction is a
backstop — call sites already avoid passing credentials or PII. (The one place
raw codes are printed is the **dev-only** e-mail fallback, active solely when
`RESEND_API_KEY` is unset.)

## Health checks

- `GET /api/health` — liveness. `{ "status": "ok" }`, no DB touch. Used by the
  compose `healthcheck`.
- `GET /api/health?deep=1` — readiness. Pings the database and reports
  `db.latencyMs`; returns **503** when the DB is unreachable, so an orchestrator
  or uptime monitor can react.

The route is wrapped with `withRoute("health", …, { quiet: true })`: a healthy
`200` emits **no** `request.finish` line, so the every-few-seconds liveness probe
doesn't bury real traffic. Anything abnormal still surfaces — a `4xx`/`5xx`
response logs `request.finish` at `warn`, an uncaught throw logs `request.error`,
and a failed deep check logs `health.db_unreachable`.

## Metrics from logs

Latency, throughput and error rate all live on the `request.finish` /
`action.finish` events (`route`, `status`, `durationMs`), and business volume on
the named events above. Point a log pipeline at stdout and build panels from
those fields — for example, with Loki/Grafana:

```logql
# p95 API latency by route
quantile_over_time(0.95, {app="progresso"} | json | msg="request.finish" | unwrap durationMs [5m]) by (route)

# 5xx rate
sum(rate({app="progresso"} | json | msg="request.finish" | status>=500 [5m]))
```

## Adding a scrape endpoint later

If pull-based metrics become preferable to log-derived ones, add a
`GET /api/metrics` route (token-guarded) backed by an in-process counter/histogram
registry, incremented from the same `withRoute` wrapper. No call sites change —
the wrapper is the single seam. This was intentionally deferred (logs first).

## How it's wired

- `src/server/observability/logger.ts` — the structured logger + redaction.
- `src/server/observability/context.ts` — the `AsyncLocalStorage` request context.
- `src/server/observability/route.ts` — `withRoute` (API routes) and
  `withAction` (server actions) wrappers.
- `src/instrumentation.ts` — Next's `register` (startup) and `onRequestError`
  (global server-error capture).
- `src/app/api/health/route.ts` — the health/readiness endpoint.
