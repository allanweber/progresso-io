// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { admin, foods } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;
let baseFoodId: string;
let clinicBFoodId: string;

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

async function addFood(description: string, clinicId: string | null) {
  const [group] = await db.select({ id: schema.foodGroup.id }).from(schema.foodGroup);
  const [row] = await db
    .insert(schema.food)
    .values({
      description,
      searchText: sql`unaccent(lower(${description}))`,
      groupId: group.id,
      type: "ingrediente",
      clinicId,
    })
    .returning({ id: schema.food.id });
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "user-a", name: "A", email: "a@x.com" },
    { id: "user-b", name: "B", email: "b@x.com" },
  ]);
  const [ca] = await db
    .insert(schema.clinic)
    .values({ name: "A", ownerUserId: "user-a" })
    .returning();
  const [cb] = await db
    .insert(schema.clinic)
    .values({ name: "B", ownerUserId: "user-b" })
    .returning();
  ctxA = ctxFor(ca.id, "user-a");
  ctxB = ctxFor(cb.id, "user-b");
  await db.insert(schema.foodGroup).values({ name: "Grupo", slug: "grupo" });
  baseFoodId = await addFood("Ovo", null);
  clinicBFoodId = await addFood("Alimento B", cb.id);
});

describe("food measures", () => {
  it("admin adds a base measure visible to every clinic (read-only for coach)", async () => {
    const m = await admin.addBaseMeasure(db as unknown as DB, baseFoodId, {
      label: "unidade",
      grams: 50,
      isDefault: true,
    });
    expect(m).not.toBeNull();

    const a = await foods.getFood(ctxA, baseFoodId);
    const b = await foods.getFood(ctxB, baseFoodId);
    expect(a!.measures).toHaveLength(1);
    expect(a!.measures[0]).toMatchObject({
      label: "unidade",
      grams: 50,
      origin: "base",
      removable: false,
    });
    expect(b!.measures).toHaveLength(1);

    // A coach can't remove a base measure.
    expect(await foods.removeMeasure(ctxA, baseFoodId, m!.id)).toBe(false);
  });

  it("coach adds a clinic measure only its own clinic sees", async () => {
    const m = await foods.addMeasure(ctxA, baseFoodId, {
      label: "fatia",
      grams: 25,
      isDefault: false,
    });
    expect(m).not.toBeNull();

    const a = await foods.getFood(ctxA, baseFoodId);
    const b = await foods.getFood(ctxB, baseFoodId);
    // A sees base + its own; B sees only the base.
    expect(a!.measures.map((x) => x.label).sort()).toEqual(["fatia", "unidade"]);
    expect(b!.measures.map((x) => x.label)).toEqual(["unidade"]);

    const own = a!.measures.find((x) => x.label === "fatia")!;
    expect(own).toMatchObject({ origin: "clinic", removable: true });
    expect(await foods.removeMeasure(ctxA, baseFoodId, own.id)).toBe(true);
  });

  it("rejects a coach measure on a food it can't see", async () => {
    expect(await foods.addMeasure(ctxA, clinicBFoodId, {
      label: "unidade",
      grams: 100,
      isDefault: false,
    })).toBeNull();
  });

  it("admin removes a base measure", async () => {
    const m = await admin.addBaseMeasure(db as unknown as DB, baseFoodId, {
      label: "dúzia",
      grams: 600,
      isDefault: false,
    });
    expect(await admin.removeBaseMeasure(db as unknown as DB, baseFoodId, m!.id)).toBe(true);
    expect(await admin.removeBaseMeasure(db as unknown as DB, baseFoodId, m!.id)).toBe(false);
  });
});
