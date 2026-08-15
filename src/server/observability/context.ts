import { AsyncLocalStorage } from "node:async_hooks";

import * as Sentry from "@sentry/nextjs";

/**
 * Per-request context, carried implicitly through the async call tree so the
 * request id can be correlated without threading it through every function.
 * Populated by the route/action wrappers (see `route.ts`) and enriched with the
 * tenant identity once the session is resolved (see `requireClinic` /
 * `getTenantContext` / `getAdminSession`).
 */
export type RequestContext = {
  /** Correlates every log line of one request; also returned as x-request-id. */
  requestId: string;
  /** HTTP method, or "ACTION" for a server action. */
  method?: string;
  /** Logical handler name, e.g. "students.list" — stable across URLs. */
  route?: string;
  /** URL pathname the request hit. */
  path?: string;
  /** Tenant identity, filled in once the session is known. */
  userId?: string;
  clinicId?: string;
  role?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** A collision-resistant request id, working in both Node and Edge runtimes. */
export function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  // Fallback for runtimes without global crypto (never expected in production).
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Runs `fn` with `ctx` as the active request context for its whole async tree. */
export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn);
}

/** The active request context, or undefined outside any request (e.g. startup). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Merges fields into the active request context and tags the current Sentry
 * scope with the tenant identity, so every event from this request carries
 * `userId`/`clinicId`/`role`. These are opaque UUIDs (not personal data), which
 * keeps this LGPD-safe while making "which clinic hit this bug" answerable.
 * A no-op on the context side when there is no active request context.
 */
export function enrichRequestContext(fields: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (current) Object.assign(current, fields);

  if (fields.userId) Sentry.setUser({ id: fields.userId });
  if (fields.clinicId) Sentry.setTag("clinicId", fields.clinicId);
  if (fields.role) Sentry.setTag("role", fields.role);
}
