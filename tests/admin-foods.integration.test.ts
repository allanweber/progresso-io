// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { type DB, schema } from "@/db";
import { admin } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let clinicAId: string;
let clinicBId: string;
let baseRice: string;
let baseBeans: string;
let clinicAFood: string;
let clinicBFood: string;

/** Inserts a food (base when clinicId is null), computing search_text like the seed. */
async function addFood(f: {
  code?: string | null;
  description: string;
  groupSlug: string;
  clinicId?: string | null;
  type?: schema.FoodType;
  energyKcal?: number | null;
  protein?: number | null;
}) {
  const [group] = await db
    .select({ id: schema.foodGroup.id })
    .from(schema.foodGroup)
    .where(sql`${schema.foodGroup.slug} = ${f.groupSlug}`);
  const [row] = await db
    .insert(schema.food)
    .values({
      code: f.code ?? null,
      description: f.description,
      searchText: sql`unaccent(lower(${f.description}))`,
      groupId: group.id,
      type: f.type ?? "ingrediente",
      clinicId: f.clinicId ?? null,
      energyKcal: f.energyKcal ?? null,
      protein: f.protein ?? null,
    })
    .returning({ id: schema.food.id });
  return row.id;
}

const adb = () => db as unknown as DB;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "u-a", name: "Coach A", email: "a@example.com" },
    { id: "u-b", name: "Coach B", email: "b@example.com" },
  ]);
  const [ca] = await db
    .insert(schema.clinic)
    .values({ name: "Clínica Alfa", ownerUserId: "u-a" })
    .returning();
  const [cb] = await db
    .insert(schema.clinic)
    .values({ name: "Clínica Beta", ownerUserId: "u-b" })
    .returning();
  clinicAId = ca.id;
  clinicBId = cb.id;

  await db.insert(schema.foodGroup).values([
    { name: "Cereais e derivados", slug: "cereais-e-derivados" },
    { name: "Leguminosas e derivados", slug: "leguminosas-e-derivados" },
  ]);

  baseRice = await addFood({
    code: "1",
    description: "Arroz, integral, cozido",
    groupSlug: "cereais-e-derivados",
    energyKcal: 124,
  });
  baseBeans = await addFood({
    code: "2",
    description: "Feijão, carioca, cozido",
    groupSlug: "leguminosas-e-derivados",
    energyKcal: 76,
  });
  clinicAFood = await addFood({
    description: "Whey da clínica Alfa",
    groupSlug: "cereais-e-derivados",
    clinicId: clinicAId,
  });
  clinicBFood = await addFood({
    description: "Barra da clínica Beta",
    groupSlug: "cereais-e-derivados",
    clinicId: clinicBId,
  });
});

describe("admin foods — cross-clinic view", () => {
  it("lists base + every clinic's foods, with clinic names", async () => {
    const { items, total } = await admin.listAllFoods(adb(), { pageSize: 100 });
    expect(total).toBe(4);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(baseRice)!.origin).toBe("base");
    expect(byId.get(baseRice)!.clinicName).toBeNull();
    expect(byId.get(clinicAFood)!.origin).toBe("clinic");
    expect(byId.get(clinicAFood)!.clinicName).toBe("Clínica Alfa");
    expect(byId.get(clinicBFood)!.clinicName).toBe("Clínica Beta");
  });

  it("filters by origin and by clinic", async () => {
    const base = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(base.items.every((i) => i.origin === "base")).toBe(true);
    expect(base.total).toBe(2);

    const clinics = await admin.listAllFoods(adb(), { origin: "clinic", pageSize: 100 });
    expect(clinics.total).toBe(2);

    const onlyA = await admin.listAllFoods(adb(), { clinicId: clinicAId, pageSize: 100 });
    expect(onlyA.items.map((i) => i.id)).toEqual([clinicAFood]);
  });

  it("searches across all foods, accent-insensitively", async () => {
    const { items } = await admin.listAllFoods(adb(), { search: "feijao" });
    expect(items.map((i) => i.description)).toContain("Feijão, carioca, cozido");
  });

  it("reads any food's detail, base or clinic", async () => {
    const base = await admin.getAnyFood(adb(), baseRice);
    expect(base?.origin).toBe("base");
    expect(base?.clinicName).toBeNull();
    const clinic = await admin.getAnyFood(adb(), clinicBFood);
    expect(clinic?.origin).toBe("clinic");
    expect(clinic?.clinicName).toBe("Clínica Beta");
  });
});

describe("admin foods — base-only writes", () => {
  let created: string;

  it("creates a shared base food", async () => {
    const food = await admin.createBaseFood(adb(), {
      description: "Tapioca, goma hidratada",
      groupSlug: "cereais-e-derivados",
      type: "ingrediente",
      energyKcal: 130,
      protein: 0,
      carbohydrate: 32,
      fat: 0,
      fiber: null,
      sodium: 1,
    });
    expect(food).not.toBeNull();
    created = food!.id;
    expect(food!.clinicId).toBeNull();
    expect(food!.source).toBe("custom");

    const base = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(base.items.some((i) => i.id === created)).toBe(true);
  });

  it("edits a base food, but never a clinic's own food", async () => {
    const updated = await admin.updateBaseFood(adb(), created, {
      description: "Tapioca, goma",
      groupSlug: "cereais-e-derivados",
      type: "ingrediente",
      energyKcal: 128,
      protein: 0,
      carbohydrate: 31,
      fat: 0,
      fiber: null,
      sodium: 1,
    });
    expect(updated?.description).toBe("Tapioca, goma");

    // A clinic-owned food cannot be edited by the admin (base-only).
    const blocked = await admin.updateBaseFood(adb(), clinicAFood, {
      description: "hack",
      groupSlug: "cereais-e-derivados",
      type: "ingrediente",
      energyKcal: null,
      protein: null,
      carbohydrate: null,
      fat: null,
      fiber: null,
      sodium: null,
    });
    expect(blocked).toBeNull();
  });

  it("archives a base food, but never a clinic's own food", async () => {
    const archived = await admin.archiveBaseFood(adb(), created);
    expect(archived?.archived).toBe(true);
    // Archived drops out of the default listing.
    const base = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(base.items.some((i) => i.id === created)).toBe(false);
    // Clinic food can't be archived here.
    expect(await admin.archiveBaseFood(adb(), clinicBFood)).toBeNull();
  });

  it("unarchives a base food, but never a clinic's own food", async () => {
    // `created` was archived in the previous test — restore it.
    const restored = await admin.unarchiveBaseFood(adb(), created);
    expect(restored?.archived).toBe(false);
    // It's back in the default (active-only) listing.
    const base = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(base.items.some((i) => i.id === created)).toBe(true);
    // A clinic's own food is never touched by the base unarchive.
    expect(await admin.unarchiveBaseFood(adb(), clinicBFood)).toBeNull();
  });
});

describe("admin foods — base substitutions", () => {
  it("adds/rejects/removes base substitution rules", async () => {
    const ok = await admin.addBaseSubstitution(adb(), baseRice, baseBeans, 90);
    expect(ok.ok).toBe(true);

    const detail = await admin.getAnyFood(adb(), baseRice);
    const sub = detail!.substitutes.find((s) => s.foodId === baseBeans);
    expect(sub?.grams).toBe(90);
    expect(sub?.removable).toBe(true);

    // Self + duplicate rejected.
    expect(await admin.addBaseSubstitution(adb(), baseRice, baseRice, 100)).toEqual({
      ok: false,
      reason: "same_food",
    });
    expect(await admin.addBaseSubstitution(adb(), baseRice, baseBeans, 80)).toEqual({
      ok: false,
      reason: "duplicate",
    });

    // The listing surfaces the base-substitution count.
    const listed = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(listed.items.find((i) => i.id === baseRice)!.substituteCount).toBe(1);

    const subId = (ok as { ok: true; substitute: { id: string } }).substitute.id;
    expect(await admin.removeBaseSubstitution(adb(), baseRice, subId)).toBe(true);
    const after = await admin.getAnyFood(adb(), baseRice);
    expect(after!.substitutes.length).toBe(0);
    const relisted = await admin.listAllFoods(adb(), { origin: "base", pageSize: 100 });
    expect(relisted.items.find((i) => i.id === baseRice)!.substituteCount).toBe(0);
  });

  it("does not remove a clinic-owned substitution as a base one", async () => {
    // A clinic rule on baseRice (clinic_id set) must be invisible/immutable here.
    const [rule] = await db
      .insert(schema.foodSubstitution)
      .values({
        clinicId: clinicAId,
        foodId: baseRice,
        substituteFoodId: baseBeans,
        grams: 70,
      })
      .returning({ id: schema.foodSubstitution.id });

    // getAnyFood only surfaces base substitutions.
    const detail = await admin.getAnyFood(adb(), baseRice);
    expect(detail!.substitutes.length).toBe(0);
    // And the base removal never touches a clinic rule.
    expect(await admin.removeBaseSubstitution(adb(), baseRice, rule.id)).toBe(false);
  });
});
