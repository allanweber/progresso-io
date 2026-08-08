// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { diets } from "@/server/dal";
import type { DietWriteInput } from "@/server/dal/diets";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

/** Inserts a food (base or clinic-owned) and returns its id. */
async function addFood(f: {
  description: string;
  groupSlug: string;
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
      description: f.description,
      searchText: sql`unaccent(lower(${f.description}))`,
      groupId: group.id,
      type: "ingrediente",
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

let arrozId: string; // base
let frangoId: string; // clinic A
let clinicBFoodId: string; // clinic B

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

  await db
    .insert(schema.foodGroup)
    .values([{ name: "Cereais e derivados", slug: "cereais-e-derivados" }]);

  arrozId = await addFood({
    description: "Arroz branco cozido",
    groupSlug: "cereais-e-derivados",
    energyKcal: 128,
    protein: 2.5,
  });
  frangoId = await addFood({
    description: "Peito de frango grelhado",
    groupSlug: "cereais-e-derivados",
    clinicId: clinicA.id,
    energyKcal: 165,
    protein: 31,
  });
  clinicBFoodId = await addFood({
    description: "Alimento da Clínica B",
    groupSlug: "cereais-e-derivados",
    clinicId: clinicB.id,
    energyKcal: 100,
  });
});

/** A diet payload: café (200 g arroz base + 100 g frango, com equivalência). */
function sampleDiet(): DietWriteInput {
  return {
    name: "Cutting 1800",
    notes: "Beber água",
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [
          {
            foodId: arrozId,
            grams: 200,
            substitutes: [{ foodId: frangoId, grams: 120 }],
          },
          { foodId: frangoId, grams: 100, substitutes: [] },
        ],
      },
      { name: "Almoço", time: null, items: [] },
    ],
  };
}

describe("diets DAL", () => {
  it("creates a diet with its tree and computes totals", async () => {
    const res = await diets.createDiet(ctxA, sampleDiet());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const detail = await diets.getDiet(ctxA, res.id);
    expect(detail).not.toBeNull();
    expect(detail!.origin).toBe("clinic");
    expect(detail!.meals).toHaveLength(2);

    const cafe = detail!.meals[0];
    expect(cafe.name).toBe("Café da manhã");
    expect(cafe.items).toHaveLength(2);

    // 200 g arroz (128/100) = 256 kcal; 100 g frango (165/100) = 165 kcal.
    expect(cafe.items[0].macros.energyKcal).toBeCloseTo(256);
    expect(cafe.items[1].macros.energyKcal).toBeCloseTo(165);
    expect(cafe.totals.energyKcal).toBeCloseTo(421);
    // Diet-wide total equals the only non-empty meal.
    expect(detail!.totals.energyKcal).toBeCloseTo(421);

    // The item's equivalence is present and scaled.
    expect(cafe.items[0].substitutes).toHaveLength(1);
    expect(cafe.items[0].substitutes[0].grams).toBe(120);
  });

  it("persists the medida-caseira snapshot on an item", async () => {
    const res = await diets.createDiet(ctxA, {
      name: "Com medida",
      notes: null,
      meals: [
        {
          name: "Almoço",
          time: null,
          items: [
            {
              foodId: arrozId,
              grams: 150,
              measureLabel: "escumadeira",
              measureGrams: 50,
              substitutes: [],
            },
          ],
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const item = (await diets.getDiet(ctxA, res.id))!.meals[0].items[0];
    expect(item.grams).toBe(150);
    expect(item.measureLabel).toBe("escumadeira");
    expect(item.measureGrams).toBe(50);
  });

  it("lists the clinic's own diet but not another clinic's", async () => {
    const listA = await diets.listDiets(ctxA);
    expect(listA.items.some((d) => d.name === "Cutting 1800")).toBe(true);

    const listB = await diets.listDiets(ctxB);
    expect(listB.items.some((d) => d.name === "Cutting 1800")).toBe(false);
  });

  it("rejects a diet referencing another clinic's food", async () => {
    const res = await diets.createDiet(ctxA, {
      name: "Inválida",
      notes: null,
      meals: [
        {
          name: "Refeição",
          time: null,
          items: [{ foodId: clinicBFoodId, grams: 50, substitutes: [] }],
        },
      ],
    });
    expect(res).toEqual({ ok: false, reason: "invalid_food" });
  });

  it("updates a diet by replacing its whole tree", async () => {
    const created = await diets.createDiet(ctxA, sampleDiet());
    if (!created.ok) throw new Error("setup failed");

    const res = await diets.updateDiet(ctxA, created.id, {
      name: "Renomeada",
      notes: null,
      meals: [
        {
          name: "Único",
          time: null,
          items: [{ foodId: arrozId, grams: 100, substitutes: [] }],
        },
      ],
    });
    expect(res.ok).toBe(true);

    const detail = await diets.getDiet(ctxA, created.id);
    expect(detail!.name).toBe("Renomeada");
    expect(detail!.notes).toBeNull();
    expect(detail!.meals).toHaveLength(1);
    expect(detail!.meals[0].items).toHaveLength(1);
    expect(detail!.totals.energyKcal).toBeCloseTo(128);
  });

  it("cannot update or read another clinic's diet", async () => {
    const created = await diets.createDiet(ctxA, sampleDiet());
    if (!created.ok) throw new Error("setup failed");

    // ctxB can't see it.
    expect(await diets.getDiet(ctxB, created.id)).toBeNull();
    // ctxB can't update it (scoped by clinicId → not_found).
    const res = await diets.updateDiet(ctxB, created.id, {
      name: "hack",
      notes: null,
      meals: [],
    });
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("archives and unarchives a diet", async () => {
    const created = await diets.createDiet(ctxA, sampleDiet());
    if (!created.ok) throw new Error("setup failed");

    expect(await diets.archiveDiet(ctxA, created.id)).toBe(true);

    // Hidden from the default listing, shown when includeArchived.
    const def = await diets.listDiets(ctxA);
    expect(def.items.some((d) => d.id === created.id)).toBe(false);
    const all = await diets.listDiets(ctxA, { includeArchived: true });
    expect(all.items.some((d) => d.id === created.id)).toBe(true);

    expect(await diets.unarchiveDiet(ctxA, created.id)).toBe(true);
    const back = await diets.listDiets(ctxA);
    expect(back.items.some((d) => d.id === created.id)).toBe(true);

    // ctxB can't archive it.
    expect(await diets.archiveDiet(ctxB, created.id)).toBe(false);
  });

  it("treats a base diet as read-only for a coach", async () => {
    const [base] = await db
      .insert(schema.diet)
      .values({ clinicId: null, coachId: null, name: "Modelo base" })
      .returning({ id: schema.diet.id });

    // Both clinics can read the base template.
    expect((await diets.getDiet(ctxA, base.id))?.origin).toBe("base");
    expect((await diets.getDiet(ctxB, base.id))?.origin).toBe("base");

    // But no coach can edit or archive it.
    const upd = await diets.updateDiet(ctxA, base.id, {
      name: "x",
      notes: null,
      meals: [],
    });
    expect(upd).toEqual({ ok: false, reason: "not_found" });
    expect(await diets.archiveDiet(ctxA, base.id)).toBe(false);
  });
});

describe("copyDiet", () => {
  it("copies a clinic diet exactly with a (cópia) suffix", async () => {
    const src = await diets.createDiet(ctxA, sampleDiet());
    expect(src.ok).toBe(true);
    if (!src.ok) return;
    const original = await diets.getDiet(ctxA, src.id);

    const copy = await diets.copyDiet(ctxA, src.id);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.id).not.toBe(src.id);

    const dup = await diets.getDiet(ctxA, copy.id);
    expect(dup!.name).toBe("Cutting 1800 (cópia)");
    expect(dup!.origin).toBe("clinic");
    expect(dup!.archived).toBe(false);
    expect(dup!.notes).toBe(original!.notes);
    // Same tree: meals, items and substitutes (food + grams), and totals.
    expect(dup!.meals.map((m) => m.name)).toEqual(
      original!.meals.map((m) => m.name),
    );
    expect(dup!.meals[0].items.map((i) => [i.foodId, i.grams])).toEqual(
      original!.meals[0].items.map((i) => [i.foodId, i.grams]),
    );
    expect(
      dup!.meals[0].items[0].substitutes.map((s) => [s.foodId, s.grams]),
    ).toEqual(
      original!.meals[0].items[0].substitutes.map((s) => [s.foodId, s.grams]),
    );
    expect(dup!.totals).toEqual(original!.totals);
  });

  it("copies a base template into an editable clinic-owned diet", async () => {
    const [base] = await db
      .insert(schema.diet)
      .values({ clinicId: null, coachId: null, name: "Modelo base" })
      .returning({ id: schema.diet.id });
    const [meal] = await db
      .insert(schema.dietMeal)
      .values({ dietId: base.id, name: "Café", time: "07:00", position: 0 })
      .returning({ id: schema.dietMeal.id });
    await db.insert(schema.dietMealItem).values({
      dietMealId: meal.id,
      foodId: arrozId,
      grams: 150,
      position: 0,
    });

    const copy = await diets.copyDiet(ctxA, base.id);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;

    const dup = await diets.getDiet(ctxA, copy.id);
    expect(dup!.name).toBe("Modelo base (cópia)");
    // The copy belongs to the clinic (unlike the base) and is editable.
    expect(dup!.origin).toBe("clinic");
    expect(dup!.meals[0].items[0].foodId).toBe(arrozId);
    const upd = await diets.updateDiet(ctxA, copy.id, {
      name: "Editada",
      notes: null,
      meals: [],
    });
    expect(upd.ok).toBe(true);
  });

  it("won't copy another clinic's diet", async () => {
    const src = await diets.createDiet(ctxA, sampleDiet());
    if (!src.ok) return;
    expect(await diets.copyDiet(ctxB, src.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("caps the copied name at 120 characters", async () => {
    const src = await diets.createDiet(ctxA, {
      name: "D".repeat(120),
      notes: null,
      meals: [],
    });
    if (!src.ok) return;
    const copy = await diets.copyDiet(ctxA, src.id);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    const dup = await diets.getDiet(ctxA, copy.id);
    expect(dup!.name.length).toBeLessThanOrEqual(120);
    expect(dup!.name.endsWith("(cópia)")).toBe(true);
  });
});
