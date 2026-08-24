// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/lib/auth";
import type { TenantContext } from "@/server/tenant";

/**
 * These wrappers are the single place the API's role guard lives — 114 handlers
 * were each carrying their own copy of it. Testing it once, properly, is what
 * makes that consolidation trustworthy, so the load-bearing assertions here are
 * the "inner handler was NOT called" ones: they prove the guard runs *before*
 * the body, not merely that the status code happens to be right.
 */

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));

const getAdminSession = vi.fn<() => Promise<Session | null>>();
vi.mock("@/server/admin", () => ({
  getAdminSession: () => getAdminSession(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { withAdmin, withCoach, withStudent } from "@/server/guard";

const tenant = (role: TenantContext["role"]): TenantContext => ({
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-1",
  role,
});

const SESSION = { user: { id: "admin-1", role: "admin" } } as Session;

const req = () => new Request("https://app.test/api/thing");

/** Typed handler mocks, so the argument assertions below are type-checked too. */
const tenantHandler = <Ctx = unknown>() =>
  vi.fn<(request: Request, tenant: TenantContext, routeCtx: Ctx) => Response>(
    () => new Response("ok"),
  );
const adminHandler = () =>
  vi.fn<(request: Request, session: Session, routeCtx: unknown) => Response>(
    () => new Response("ok"),
  );

beforeEach(() => {
  getTenantContext.mockReset();
  getAdminSession.mockReset();
});

describe("withCoach", () => {
  it("answers 401 without running the handler when there is no session", async () => {
    getTenantContext.mockResolvedValue(null);
    const inner = tenantHandler();

    const res = await withCoach("t.coach", inner)(req(), undefined);

    expect(res.status).toBe(401);
    expect(inner).not.toHaveBeenCalled();
  });

  it("answers 403 without running the handler for an aluno", async () => {
    getTenantContext.mockResolvedValue(tenant("aluno"));
    const inner = tenantHandler();

    const res = await withCoach("t.coach", inner)(req(), undefined);

    expect(res.status).toBe(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("runs the handler for a coach and hands it the tenant context", async () => {
    getTenantContext.mockResolvedValue(tenant("coach"));
    const inner = tenantHandler();

    const res = await withCoach("t.coach", inner)(req(), undefined);

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner.mock.calls[0][1]).toMatchObject({ clinicId: "clinic-1" });
  });
});

describe("withStudent", () => {
  it("answers 403 without running the handler for a coach", async () => {
    getTenantContext.mockResolvedValue(tenant("coach"));
    const inner = tenantHandler();

    const res = await withStudent("t.student", inner)(req(), undefined);

    expect(res.status).toBe(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("runs the handler for an aluno", async () => {
    getTenantContext.mockResolvedValue(tenant("aluno"));
    const inner = tenantHandler();

    const res = await withStudent("t.student", inner)(req(), undefined);

    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe("withAdmin", () => {
  it("answers 403 — not 401 — without running the handler when unauthenticated", async () => {
    getAdminSession.mockResolvedValue(null);
    const inner = adminHandler();

    const res = await withAdmin("t.admin", inner)(req(), undefined);

    expect(res.status).toBe(403);
    expect(inner).not.toHaveBeenCalled();
  });

  it("runs the handler for an admin and hands it the session", async () => {
    getAdminSession.mockResolvedValue(SESSION);
    const inner = adminHandler();

    const res = await withAdmin("t.admin", inner)(req(), undefined);

    expect(res.status).toBe(200);
    expect(inner.mock.calls[0][1]).toBe(SESSION);
  });
});

describe("route context passthrough", () => {
  it("hands Next's route context to the handler as its third argument", async () => {
    getTenantContext.mockResolvedValue(tenant("coach"));
    type Params = { params: Promise<{ id: string }> };
    const routeCtx: Params = { params: Promise.resolve({ id: "abc" }) };
    const inner = tenantHandler<Params>();

    await withCoach<Params>("t.params", inner)(req(), routeCtx);

    expect(inner.mock.calls[0][2]).toBe(routeCtx);
  });
});
