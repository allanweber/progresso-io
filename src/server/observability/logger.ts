/**
 * Minimal console logger. The previous structured-JSON logger (with PII
 * redaction and request-context field merging) was removed in favour of Sentry
 * for error tracking; this keeps the same call surface (`logger.info/warn/error/
 * debug`) so existing call sites are unchanged, emitting plain console lines.
 * Genuine errors are additionally reported to Sentry by the route/action
 * wrappers (see `route.ts`) and Next's `onRequestError` hook.
 *
 * `LOG_LEVEL` (debug|info|warn|error) still gates verbosity; defaults to `info`
 * in production and `debug` otherwise.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function threshold(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return ORDER[raw];
  }
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug;
}

const min = threshold();

/** Extra fields for an event. Passed through to the console as a second arg. */
export type LogFields = Record<string, unknown> & { err?: unknown };

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  if (ORDER[level] < min) return;
  const args: unknown[] = fields ? [msg, fields] : [msg];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};

export type Logger = typeof logger;
