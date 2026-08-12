// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { admin } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let h: DB;

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
});

describe("admin plan-limit config (reference data)", () => {
  it("upserts a plan's caps — inserts a missing row, then updates it", async () => {
    // Fresh DB: plan_limit is empty, so the first write must INSERT.
    const inserted = await admin.upsertPlanLimit(h, "solo", {
      maxStudents: 50,
      maxCoaches: 1,
      whatsapp: true,
    });
    expect(inserted).toMatchObject({
      plan: "solo",
      maxStudents: 50,
      maxCoaches: 1,
      whatsapp: true,
    });

    // A second write for the same plan UPDATEs in place (no duplicate row).
    const updated = await admin.upsertPlanLimit(h, "solo", {
      maxStudents: 60,
      maxCoaches: 2,
      whatsapp: false,
    });
    expect(updated).toMatchObject({
      maxStudents: 60,
      maxCoaches: 2,
      whatsapp: false,
    });

    const rows = await h
      .select()
      .from(schema.planLimit)
      .where(eq(schema.planLimit.plan, "solo"));
    expect(rows).toHaveLength(1);
  });

  it("stores null caps as unlimited and lists every configured plan", async () => {
    await admin.upsertPlanLimit(h, "enterprise", {
      maxStudents: null,
      maxCoaches: null,
      whatsapp: true,
    });

    const list = await admin.listPlanLimits(h);
    const ent = list.find((p) => p.plan === "enterprise");
    expect(ent).toMatchObject({ maxStudents: null, maxCoaches: null });
    expect(list.map((p) => p.plan)).toEqual(
      expect.arrayContaining(["solo", "enterprise"]),
    );
  });
});
