// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/server/tenant";

const getTenantContext = vi.fn<() => Promise<TenantContext | null>>();
vi.mock("@/server/tenant", () => ({ getTenantContext: () => getTenantContext() }));

const listExercises = vi.hoisted(() =>
  vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 24 })),
);
vi.mock("@/server/dal", () => ({ exercises: { listExercises } }));

import { GET } from "@/app/api/exercises/route";

const COACH: TenantContext = {
  db: {} as TenantContext["db"],
  clinicId: "clinic-1",
  userId: "user-coach",
  role: "coach",
};

const list = (qs: string) =>
  GET(new Request(`http://localhost/api/exercises${qs}`), undefined as never);

beforeEach(() => {
  getTenantContext.mockReset();
  getTenantContext.mockResolvedValue(COACH);
  listExercises.mockClear();
});

describe("GET /api/exercises filters", () => {
  it("passes the openGym filters to the DAL", async () => {
    const res = await list(
      "?search=sup&bodyPart=upper+legs&category=strength&equipment=body+weight&target=quads&page=2",
    );
    expect(res.status).toBe(200);
    expect(listExercises).toHaveBeenCalledWith(COACH, {
      search: "sup",
      bodyPart: "upper legs",
      category: "strength",
      equipment: "body weight",
      target: "quads",
      page: 2,
    });
  });

  it.each([
    "?bodyPart=legs",
    "?category=powerlifting",
    "?equipment=machine",
    "?target=quadriceps",
    "?pageSize=500",
  ])("rejects %s", async (qs) => {
    const res = await list(qs);
    expect(res.status).toBe(422);
    expect(listExercises).not.toHaveBeenCalled();
  });
});
