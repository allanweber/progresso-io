import { getRequestContext } from "./context";

/**
 * Structured, stdout-first logger. Every event is a single line of JSON so the
 * container runtime (Docker → Dokploy) captures it and any aggregator (Loki,
 * CloudWatch, Datadog…) can parse it — no vendor SDK required. Request-scoped
 * fields (requestId, tenant identity, route) are merged in automatically from
 * the async context, so call sites only pass what's specific to the event.
 *
 * Metrics are derived from these logs for now (durations and outcomes live on
 * `request.finish` / `action.finish` events); a scrape endpoint can be added
 * later without touching call sites.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const threshold = ORDER[configuredLevel()];

/** Extra fields for an event. `err` is special-cased into a serialized error. */
export type LogFields = Record<string, unknown> & { err?: unknown };

/**
 * Keys whose values must never reach the logs. Matched case-insensitively on
 * the whole key name, at any depth. Keep this list ahead of what call sites
 * might accidentally pass (form bodies, headers, env-derived values).
 */
const SENSITIVE =
  /^(password|otp|token|token_?hash|secret|authorization|cookie|set-cookie|access_?token|refresh_?token|id_?token|database_?url|better_auth_secret|resend_api_key|google_client_secret)$/i;

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

/** Deep-copy with sensitive keys masked. Bounded depth guards against cycles. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE.test(key) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}

function write(level: LogLevel, msg: string, fields?: LogFields): void {
  if (ORDER[level] < threshold) return;

  const ctx = getRequestContext();
  const { err, ...rest } = fields ?? {};

  const record: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg,
    // Request-scoped fields (undefined ones are dropped by JSON.stringify).
    requestId: ctx?.requestId,
    method: ctx?.method,
    route: ctx?.route,
    path: ctx?.path,
    userId: ctx?.userId,
    clinicId: ctx?.clinicId,
    role: ctx?.role,
    ...(redact(rest) as Record<string, unknown>),
  };
  if (err !== undefined) record.err = redact(serializeError(err));

  // `console` keeps this cross-runtime (Node + Edge); each call is one JSON line.
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => write("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};

export type Logger = typeof logger;
