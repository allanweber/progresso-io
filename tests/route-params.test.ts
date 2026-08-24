// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Session } from "@/lib/auth";
import type { TenantContext } from "@/server/tenant";

/**
 * A dynamic route segment is external input, so AGENTS.md's zod rule applies to
 * it. These three routes were the last that passed a raw segment into a DAL
 * call. The assertion that matters in every case below is
 * `expect(dalFn).not.toHaveBeenCalled()` — all three routes 404 on a miss
 * anyway, so a status-only assertion would still pass with the guard removed.
 */

const getAdminSession = vi.fn<() => Promise<Session | null>>();
vi.mock("@/server/admin", () => ({ getAdminSession: () => getAdminSession() }));

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({
  getTenantContext: () => getTenantContext(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// `vi.hoisted` because vi.mock factories are lifted above normal declarations.
const { getUserById, isClinicOwner, removeCoach, getPublicLogoKeyBySlug } =
  vi.hoisted(() => ({
    getUserById: vi.fn<(db: unknown, id: string) => Promise<unknown>>(),
    isClinicOwner: vi.fn<(ctx: unknown) => Promise<boolean>>(),
    removeCoach: vi.fn<
      (ctx: unknown, id: string) => Promise<{ ok: boolean; reason?: string }>
    >(),
    getPublicLogoKeyBySlug:
      vi.fn<(db: unknown, slug: string) => Promise<string | null>>(),
  }));
vi.mock("@/server/dal", () => ({
  admin: { getUserById, deleteAdminAtomic: vi.fn(async () => "not_found") },
  coaches: { isClinicOwner, removeCoach },
  clinics: { getPublicLogoKeyBySlug },
}));

// The logo route streams bytes from R2 once a key is found; never reached here.
vi.mock("@/server/r2", () => ({ readClinicLogo: vi.fn(async () => null) }));

import * as adminRoute from "@/app/api/admin/admins/[id]/route";
import * as coachRoute from "@/app/api/coach/team/coaches/[coachId]/route";
import * as logoRoute from "@/app/api/public/clinic/[slug]/logo/route";

const req = (path: string) => new Request(`https://app.test${path}`);
const SESSION = { user: { id: "admin-1", role: "admin" } } as Session;
const COACH: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-1",
  role: "coach",
};

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSession.mockResolvedValue(SESSION);
  getTenantContext.mockResolvedValue(COACH);
  isClinicOwner.mockResolvedValue(true);
  removeCoach.mockResolvedValue({ ok: false, reason: "not_found" });
  getUserById.mockResolvedValue(null);
  getPublicLogoKeyBySlug.mockResolvedValue(null);
});

describe("DELETE /api/admin/admins/[id]", () => {
  it.each(["../../etc/passwd", "a".repeat(200), ""])(
    "404s a malformed id (%j) without touching the DAL",
    async (id) => {
      const res = await adminRoute.DELETE(req("/api/admin/admins/x"), {
        params: Promise.resolve({ id }),
      });

      expect(res.status).toBe(404);
      expect(getUserById).not.toHaveBeenCalled();
    },
  );

  it("lets a well-formed id reach the DAL", async () => {
    const res = await adminRoute.DELETE(req("/api/admin/admins/x"), {
      params: Promise.resolve({ id: "sV3kQ2mZ_ab-9" }),
    });

    expect(getUserById).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404); // the mock returns no such user
  });
});

describe("DELETE /api/coach/team/coaches/[coachId]", () => {
  it("404s a malformed coachId without touching the DAL", async () => {
    const res = await coachRoute.DELETE(req("/api/coach/team/coaches/x"), {
      params: Promise.resolve({ coachId: "../../etc/passwd" }),
    });

    expect(res.status).toBe(404);
    expect(removeCoach).not.toHaveBeenCalled();
  });

  it("lets a well-formed coachId reach the DAL", async () => {
    await coachRoute.DELETE(req("/api/coach/team/coaches/x"), {
      params: Promise.resolve({ coachId: "sV3kQ2mZ_ab-9" }),
    });

    expect(removeCoach).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/public/clinic/[slug]/logo", () => {
  it.each(["UPPERCASE", "ab", "-leading-hyphen", "login"])(
    "404s an invalid slug (%j) without touching the DAL",
    async (slug) => {
      const res = await logoRoute.GET(req("/api/public/clinic/x/logo"), {
        params: Promise.resolve({ slug }),
      });

      expect(res.status).toBe(404);
      expect(getPublicLogoKeyBySlug).not.toHaveBeenCalled();
    },
  );

  it("lets a valid slug reach the DAL", async () => {
    await logoRoute.GET(req("/api/public/clinic/x/logo"), {
      params: Promise.resolve({ slug: "minha-clinica" }),
    });

    expect(getPublicLogoKeyBySlug).toHaveBeenCalledTimes(1);
    expect(getPublicLogoKeyBySlug.mock.calls[0][1]).toBe("minha-clinica");
  });
});
