// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/server/tenant";

/**
 * H-1 regression: the coach-only student endpoints must reject an authenticated
 * `aluno` (and any non-coach) with 403, not just hide the buttons. We mock the
 * session boundary (`getTenantContext`) so the test drives the role gate without
 * a database — an aluno is refused BEFORE any DAL call runs.
 */

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({ getTenantContext: () => getTenantContext() }));

// The list/register handlers touch the DAL only AFTER the gate; stub it so an
// accidental pass-through can't hit a real (absent) database and mask a failure.
vi.mock("@/server/dal", () => ({
  students: {
    listStudents: vi.fn(async () => []),
    getStudentRoster: vi.fn(async () => null),
    updateStudent: vi.fn(async () => null),
    setStudentStatus: vi.fn(async () => null),
    archiveStudent: vi.fn(async () => null),
    findStudentByEmail: vi.fn(async () => null),
    findStudentByPhone: vi.fn(async () => null),
    countStudents: vi.fn(async () => 0),
    createStudent: vi.fn(async () => ({ id: "s1" })),
  },
  plans: { getStudentLimit: vi.fn(async () => 100) },
  studentAnamneses: { assignAnamnesis: vi.fn(async () => ({ ok: true })) },
}));

import * as list from "@/app/api/students/route";
import * as one from "@/app/api/students/[id]/route";
import * as invite from "@/app/api/students/[id]/invite/route";

const ALUNO: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-aluno",
  role: "aluno",
};

const idCtx = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };
const req = (method: string) =>
  new Request("http://localhost/api/students", { method });

beforeEach(() => getTenantContext.mockReset());

describe("student endpoints reject a non-coach (H-1)", () => {
  const cases: Array<[string, () => Response | Promise<Response>]> = [
    ["GET /api/students", () => list.GET(req("GET"), undefined as never)],
    ["GET /api/students/[id]", () => one.GET(req("GET"), idCtx)],
    ["PUT /api/students/[id]", () => one.PUT(req("PUT"), idCtx)],
    ["PATCH /api/students/[id]", () => one.PATCH(req("PATCH"), idCtx)],
    ["DELETE /api/students/[id]", () => one.DELETE(req("DELETE"), idCtx)],
    ["POST /api/students/[id]/invite", () => invite.POST(req("POST"), idCtx)],
  ];

  it.each(cases)("%s → 403 for an aluno", async (_label, call) => {
    getTenantContext.mockResolvedValue(ALUNO);
    const res = await call();
    expect(res.status).toBe(403);
  });

  it.each(cases)("%s → 401 when unauthenticated", async (_label, call) => {
    getTenantContext.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
  });
});
