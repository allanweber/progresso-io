import type { Session } from "@/lib/auth";
import { forbidden, unauthorized } from "@/server/api";
import { getAdminSession } from "@/server/admin";
import { type RouteHandler, withRoute } from "@/server/observability";
import { getTenantContext, type TenantContext } from "@/server/tenant";

/**
 * Role-aware route wrappers.
 *
 * WHY THESE EXIST: every tenant-scoped handler used to open with the same three
 * lines — derive the tenant, 401 if absent, 403 if the role is wrong. Repeated
 * across 100+ handlers, that guarantee lived entirely in author discipline: a
 * route that forgot the role line still compiled, still linted, and quietly
 * served another role's data. Here the role is part of how a handler is
 * REGISTERED, so it cannot be forgotten — a handler that runs has already been
 * authorized, and its `tenant` argument proves it.
 *
 * This does not change what is enforced, only where. The tenant still comes from
 * the session via `getTenantContext()` and never from client input (AGENTS.md),
 * and every handler still validates its own input with zod.
 *
 * Public/token-authenticated routes (webhooks, invite acceptance, the healthcheck)
 * keep using `withRoute` directly — they have no session to gate on.
 */

/** A handler that only runs once the caller is authenticated AND authorized. */
type GuardedHandler<Ctx> = (
  request: Request,
  tenant: TenantContext,
  routeCtx: Ctx,
) => Promise<Response> | Response;

/** A handler for platform admins, who work outside any clinic (no tenant). */
type AdminHandler<Ctx> = (
  request: Request,
  session: Session,
  routeCtx: Ctx,
) => Promise<Response> | Response;

/**
 * Builds a wrapper that admits exactly one clinic role. Not exported: callers
 * use the named wrappers below so a role is always spelled out at the call site
 * rather than passed as a string that could be mistyped.
 */
function withRole(role: TenantContext["role"]) {
  return function guard<Ctx = unknown>(
    name: string,
    handler: GuardedHandler<Ctx>,
  ): RouteHandler<Ctx> {
    return withRoute<Ctx>(name, async (request, routeCtx) => {
      const tenant = await getTenantContext();
      if (!tenant) return unauthorized();
      if (tenant.role !== role) return forbidden();
      return handler(request, tenant, routeCtx);
    });
  };
}

/** Coach-only endpoint. The handler receives the clinic-scoped tenant context. */
export const withCoach = withRole("coach");

/** Aluno-only endpoint (the student portal). Same contract as {@link withCoach}. */
export const withStudent = withRole("aluno");

/**
 * Platform-admin-only endpoint. Admins belong to no clinic, so the handler gets
 * the session rather than a TenantContext — cross-tenant DAL calls in
 * `@/server/dal/admin` take a raw `db` handle instead.
 *
 * Answers 403 (not 401) for an absent session, preserving the behaviour of the
 * handlers this replaced: the admin surface does not disclose whether a caller
 * is signed out or merely not an admin.
 */
export function withAdmin<Ctx = unknown>(
  name: string,
  handler: AdminHandler<Ctx>,
): RouteHandler<Ctx> {
  return withRoute<Ctx>(name, async (request, routeCtx) => {
    const session = await getAdminSession();
    if (!session) return forbidden();
    return handler(request, session, routeCtx);
  });
}
