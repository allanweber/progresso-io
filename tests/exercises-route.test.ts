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

describe("GET /api/exercises openGym filter", () => {
  it("asks the DAL for openGym exercises only when openGym=1", async () => {
    const res = await list("?openGym=1&search=sup");
    expect(res.status).toBe(200);
    expect(listExercises).toHaveBeenCalledWith(
      COACH,
      expect.objectContaining({ openGymOnly: true, search: "sup" }),
    );
  });

  it("lists every exercise when the flag is absent", async () => {
    await list("?search=sup");
    expect(listExercises).toHaveBeenCalledWith(
      COACH,
      expect.objectContaining({ openGymOnly: false }),
    );
  });

  it.each(["0", "true", "yes"])("rejects openGym=%s", async (value) => {
    const res = await list(`?openGym=${value}`);
    expect(res.status).toBe(422);
    expect(listExercises).not.toHaveBeenCalled();
  });
});
