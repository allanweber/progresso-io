// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { foods } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

/** Inserts a food, computing search_text via unaccent(lower()) like the seed. */
async function addFood(f: {
  code?: string | null;
  description: string;
  groupSlug: string;
  type?: schema.FoodType;
  clinicId?: string | null;
  energyKcal?: number | null;
  protein?: number | null;
  archived?: boolean;
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
      archived: f.archived ?? false,
    })
    .returning({ id: schema.food.id });
  return row.id;
}

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

let acaiId: string;
let arrozId: string;
let clinicBFoodId: string;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "user-a", name: "Coach A", email: "a@example.com" },
    { id: "user-b", name: "Coach B", email: "b@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "user-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "user-b" })
    .returning();
  ctxA = ctxFor(clinicA.id, "user-a");
  ctxB = ctxFor(clinicB.id, "user-b");

  await db.insert(schema.foodGroup).values([
    { name: "Frutas e derivados", slug: "frutas-e-derivados" },
    { name: "Cereais e derivados", slug: "cereais-e-derivados" },
  ]);
  await db.insert(schema.nutrient).values([
    { id: "energy_kcal", label: "Energia", unit: "kcal", kind: "energy", sortOrder: 0 },
    { id: "protein", label: "Proteína", unit: "g", kind: "macro", sortOrder: 1 },
    { id: "calcium", label: "Cálcio", unit: "mg", kind: "mineral", sortOrder: 2 },
  ]);

  // Base catalog (clinicId null).
  acaiId = await addFood({
    code: "C1",
    description: "Açaí, polpa, congelada",
    groupSlug: "frutas-e-derivados",
    energyKcal: 58,
    protein: 0.8,
  });
  arrozId = await addFood({
    code: "C2",
    description: "Arroz, integral, cozido",
    groupSlug: "cereais-e-derivados",
    type: "ingrediente",
    energyKcal: 108,
    protein: 2.44,
  });
  await addFood({
    code: "C3",
    description: "Alimento arquivado",
    groupSlug: "frutas-e-derivados",
    archived: true,
  });

  // Custom foods.
  await addFood({
    description: "Whey própria da clínica A",
    groupSlug: "cereais-e-derivados",
    clinicId: ctxA.clinicId,
    energyKcal: 400,
  });
  clinicBFoodId = await addFood({
    description: "Barra própria da clínica B",
    groupSlug: "cereais-e-derivados",
    clinicId: ctxB.clinicId,
  });

  // Full profile for açaí + a base substitution açaí -> arroz (50 g).
  await db.insert(schema.foodNutrient).values([
    { foodId: acaiId, nutrientId: "energy_kcal", value: 58, isTrace: false },
    { foodId: acaiId, nutrientId: "protein", value: 0.8, isTrace: false },
    { foodId: acaiId, nutrientId: "calcium", value: null, isTrace: true },
  ]);
  await db.insert(schema.foodSubstitution).values({
    clinicId: null,
    foodId: acaiId,
    substituteFoodId: arrozId,
    grams: 50,
  });
});

describe("foods DAL", () => {
  it("lists base + own custom foods, excluding archived and other clinics", async () => {
    const { items, total } = await foods.listFoods(ctxA, { pageSize: 100 });
    const descriptions = items.map((i) => i.description);
    expect(descriptions).toContain("Açaí, polpa, congelada");
    expect(descriptions).toContain("Arroz, integral, cozido");
    expect(descriptions).toContain("Whey própria da clínica A");
    expect(descriptions).not.toContain("Barra própria da clínica B");
    expect(descriptions).not.toContain("Alimento arquivado");
    expect(total).toBe(3);
  });

  it("marks origin base vs clinic", async () => {
    const { items } = await foods.listFoods(ctxA, { pageSize: 100 });
    const acai = items.find((i) => i.description.startsWith("Açaí"))!;
    const whey = items.find((i) => i.description.startsWith("Whey"))!;
    expect(acai.origin).toBe("base");
    expect(whey.origin).toBe("clinic");
  });

  it("searches accent- and case-insensitively", async () => {
    const { items } = await foods.listFoods(ctxA, { search: "acai" });
    expect(items.map((i) => i.description)).toContain("Açaí, polpa, congelada");
    const upper = await foods.listFoods(ctxA, { search: "AÇAÍ" });
    expect(upper.items.map((i) => i.description)).toContain(
      "Açaí, polpa, congelada",
    );
  });

  it("requires every search token to match", async () => {
    const hit = await foods.listFoods(ctxA, { search: "arroz integral" });
    expect(hit.items).toHaveLength(1);
    const miss = await foods.listFoods(ctxA, { search: "arroz banana" });
    expect(miss.items).toHaveLength(0);
  });

  it("filters by group and paginates", async () => {
    const cereais = await foods.listFoods(ctxA, {
      groupSlug: "cereais-e-derivados",
      pageSize: 100,
    });
    // Arroz (base) + Whey (own) — not clinic B's barra.
    expect(cereais.total).toBe(2);

    const firstPage = await foods.listFoods(ctxA, { pageSize: 1, page: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(3);
  });

  it("returns a detail with ordered nutrients and visible substitutes", async () => {
    const detail = await foods.getFood(ctxA, acaiId);
    expect(detail).not.toBeNull();
    expect(detail!.origin).toBe("base");
    expect(detail!.nutrients.map((n) => n.id)).toEqual([
      "energy_kcal",
      "protein",
      "calcium",
    ]);
    // Trace preserved distinctly from a real value.
    expect(detail!.nutrients.find((n) => n.id === "calcium")).toMatchObject({
      value: null,
      isTrace: true,
    });
    expect(detail!.substitutes).toHaveLength(1);
    expect(detail!.substitutes[0]).toMatchObject({
      description: "Arroz, integral, cozido",
      grams: 50,
    });
  });

  it("does not leak another clinic's custom food from getFood", async () => {
    expect(await foods.getFood(ctxA, clinicBFoodId)).toBeNull();
    // The owning clinic can read it.
    expect(await foods.getFood(ctxB, clinicBFoodId)).not.toBeNull();
  });
});
