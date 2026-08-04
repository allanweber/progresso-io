import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks: isolate requireRole from Next runtime + Better Auth -------------

const getSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

/** Emulates next/navigation redirect: throws to halt, carrying the target. */
class RedirectError extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

import { requireRole, requireSession } from "@/lib/session";

function sessionForRole(role: string | null) {
  return role === null ? null : { user: { id: "u1", role } };
}

/** Runs `fn`, returning the redirect target it triggered (or null). */
async function redirectTarget(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
}

describe("requireSession", () => {
  beforeEach(() => getSession.mockReset());

  it("redirects to /login when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    expect(await redirectTarget(() => requireSession())).toBe("/login");
  });

  it("returns the session when authenticated", async () => {
    getSession.mockResolvedValue(sessionForRole("coach"));
    const session = await requireSession();
    expect(session.user.role).toBe("coach");
  });
});

describe("requireRole — strict, single-role isolation", () => {
  beforeEach(() => getSession.mockReset());

  it("lets a role into its own area", async () => {
    getSession.mockResolvedValue(sessionForRole("coach"));
    expect(await redirectTarget(() => requireRole(["coach"]))).toBeNull();
  });

  it("keeps an aluno out of the coach area", async () => {
    getSession.mockResolvedValue(sessionForRole("aluno"));
    expect(await redirectTarget(() => requireRole(["coach"]))).toBe("/student");
  });

  it("keeps an admin out of the coach area (no super-admin override)", async () => {
    getSession.mockResolvedValue(sessionForRole("admin"));
    expect(await redirectTarget(() => requireRole(["coach"]))).toBe("/admin");
  });

  it("keeps a coach out of the admin area", async () => {
    getSession.mockResolvedValue(sessionForRole("coach"));
    expect(await redirectTarget(() => requireRole(["admin"]))).toBe("/coach");
  });

  it("keeps a coach out of the aluno area", async () => {
    getSession.mockResolvedValue(sessionForRole("coach"));
    expect(await redirectTarget(() => requireRole(["aluno"]))).toBe("/coach");
  });

  it("keeps an admin out of the aluno area", async () => {
    getSession.mockResolvedValue(sessionForRole("admin"));
    expect(await redirectTarget(() => requireRole(["aluno"]))).toBe("/admin");
  });

  it("sends an unknown/corrupt role to /login (no redirect loop)", async () => {
    getSession.mockResolvedValue(sessionForRole("root"));
    expect(await redirectTarget(() => requireRole(["coach"]))).toBe("/login");
  });

  it("redirects to /login when there is no session", async () => {
    getSession.mockResolvedValue(null);
    expect(await redirectTarget(() => requireRole(["coach"]))).toBe("/login");
  });
});
