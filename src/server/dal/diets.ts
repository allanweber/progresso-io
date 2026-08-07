import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { DB } from "@/db";
import { schema } from "@/db";
import type { TenantContext } from "@/server/tenant";

/** The transaction handle drizzle hands the `db.transaction(async (tx) => …)` callback. */
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Diet DAL. A diet is a coach-authored meal-plan template with the same
 * base/custom shape as the rest of the catalog: a `diet` row with
 * `clinicId = null` is a shared base/template diet (reserved for a future
 * platform/admin catalog), a row with `clinicId` set is a clinic's own diet.
 * Every read is scoped to `clinicId IS NULL OR clinicId = ctx.clinicId`, so a
 * clinic sees the base templates plus only its own diets. Writes always stamp
 * `ctx.clinicId` (and `ctx.userId` as the author) and scope their WHERE by it,
 * so a coach can only ever touch its own diets — a base diet stays read-only.
 *
 * Nutrition is never stored: per-item and per-meal/diet totals are computed
 * here from the referenced `food` rows (a live reference, per 100 g × grams/100).
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Whether a diet is a shared base template or the clinic's own. */
export type DietOrigin = "base" | "clinic";

/** A row in the Dietas listing. */
export type DietListItem = {
  id: string;
  name: string;
  origin: DietOrigin;
  archived: boolean;
  mealCount: number;
  itemCount: number;
  /** Sum of every item's macros, computed from the referenced foods. */
  totalKcal: number;
  totalProtein: number;
  totalCarbohydrate: number;
  totalFat: number;
  updatedAt: Date;
};

export type DietListParams = {
  search?: string;
  /** Include archived diets (the listing hides them by default). */
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type DietListResult = {
  items: DietListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Scaled macros of one food line (per its grams), any field null if unmeasured. */
export type DietMacros = {
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

/** A substitute a coach offers for a meal item: `grams` of `food` may replace it. */
export type DietItemSubstitute = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  origin: DietOrigin;
  grams: number;
  measureLabel: string | null;
  measureGrams: number | null;
  macros: DietMacros;
};

/** A catalog substitute available for the item's food (a base/clinic swap). */
export type DietFoodSubstitute = {
  foodId: string;
  description: string;
  /** Grams of the substitute equivalent to 100 g of the item's food. */
  grams: number;
};

/** A food line within a meal, with its scaled macros and its substitutes. */
export type DietItem = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  origin: DietOrigin;
  grams: number;
  measureLabel: string | null;
  measureGrams: number | null;
  macros: DietMacros;
  /** Coach-defined equivalences for this diet item. */
  substitutes: DietItemSubstitute[];
  /** The food's catalog substitutes (base + clinic), for reference. */
  foodSubstitutes: DietFoodSubstitute[];
};

/** A meal within a diet: its items plus the summed macros of those items. */
export type DietMealDetail = {
  id: string;
  name: string;
  time: string | null;
  position: number;
  items: DietItem[];
  totals: DietMacros;
};

/** A full diet: its meals (with items/substitutes) and the diet-wide totals. */
export type DietDetail = {
  id: string;
  name: string;
  notes: string | null;
  origin: DietOrigin;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  meals: DietMealDetail[];
  totals: DietMacros;
};

/** Scales a per-100 g value by grams (null stays null). */
function scale(value: number | null, grams: number): number | null {
  if (value === null || value === undefined) return null;
  return (value * grams) / 100;
}

/** Adds two nullable macro values, treating null as 0 unless both are null. */
function addMacro(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Sums a list of macro sets into one (per-meal / per-diet totals). */
function sumMacros(list: DietMacros[]): DietMacros {
  return list.reduce<DietMacros>(
    (acc, m) => ({
      energyKcal: addMacro(acc.energyKcal, m.energyKcal),
      protein: addMacro(acc.protein, m.protein),
      carbohydrate: addMacro(acc.carbohydrate, m.carbohydrate),
      fat: addMacro(acc.fat, m.fat),
    }),
    { energyKcal: null, protein: null, carbohydrate: null, fat: null },
  );
}

/** The tenant scope shared by every diet read: base templates + this clinic's. */
function visibleDiet(ctx: TenantContext) {
  return or(
    isNull(schema.diet.clinicId),
    eq(schema.diet.clinicId, ctx.clinicId),
  );
}

/** Builds the WHERE for the listing: tenant scope + archived + search. */
function listWhere(ctx: TenantContext, params: DietListParams) {
  const conds = [visibleDiet(ctx)];
  if (!params.includeArchived) conds.push(eq(schema.diet.archived, false));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`unaccent(lower(${schema.diet.name})) like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return and(...conds);
}

/**
 * A page of the diets visible to this clinic (base templates + own), excluding
 * archived by default. Each row carries the meal/item counts and the total
 * kcal, computed from the referenced foods. Ordered by most recently updated.
 */
export async function listDiets(
  ctx: TenantContext,
  params: DietListParams = {},
): Promise<DietListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = listWhere(ctx, params);

  const rows = await ctx.db
    .select({
      id: schema.diet.id,
      name: schema.diet.name,
      clinicId: schema.diet.clinicId,
      archived: schema.diet.archived,
      updatedAt: schema.diet.updatedAt,
      // These correlated subqueries reference the outer row by the table's real
      // name (`diet.id`): with no joins on the outer query, drizzle renders the
      // selected columns unqualified, so an interpolated `diet.id` would collide
      // with the subquery tables' own `id` column ("ambiguous column").
      mealCount: sql<number>`(
        select count(*)::int from diet_meal m where m.diet_id = diet.id
      )`,
      itemCount: sql<number>`(
        select count(*)::int from diet_meal_item i
        join diet_meal m on m.id = i.diet_meal_id
        where m.diet_id = diet.id
      )`,
      totalKcal: sql<number>`(
        select coalesce(sum(f.energy_kcal * i.grams / 100), 0)
        from diet_meal_item i
        join diet_meal m on m.id = i.diet_meal_id
        join food f on f.id = i.food_id
        where m.diet_id = diet.id
      )`,
      totalProtein: sql<number>`(
        select coalesce(sum(f.protein * i.grams / 100), 0)
        from diet_meal_item i
        join diet_meal m on m.id = i.diet_meal_id
        join food f on f.id = i.food_id
        where m.diet_id = diet.id
      )`,
      totalCarbohydrate: sql<number>`(
        select coalesce(sum(f.carbohydrate * i.grams / 100), 0)
        from diet_meal_item i
        join diet_meal m on m.id = i.diet_meal_id
        join food f on f.id = i.food_id
        where m.diet_id = diet.id
      )`,
      totalFat: sql<number>`(
        select coalesce(sum(f.fat * i.grams / 100), 0)
        from diet_meal_item i
        join diet_meal m on m.id = i.diet_meal_id
        join food f on f.id = i.food_id
        where m.diet_id = diet.id
      )`,
    })
    .from(schema.diet)
    .where(where)
    .orderBy(desc(schema.diet.updatedAt), asc(schema.diet.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.diet)
    .where(where);

  const items: DietListItem[] = rows.map(({ clinicId, ...r }) => ({
    ...r,
    origin: clinicId === null ? "base" : "clinic",
    totalKcal: Math.round(Number(r.totalKcal)),
    totalProtein: Number(r.totalProtein),
    totalCarbohydrate: Number(r.totalCarbohydrate),
    totalFat: Number(r.totalFat),
  }));

  return { items, total, page, pageSize };
}

/**
 * A single diet with its full tree — meals (ordered), each item's food and
 * scaled macros, and each item's substitutes — plus per-meal and diet-wide
 * totals. Returns null when the id is neither a base template nor one of this
 * clinic's own diets.
 */
export async function getDiet(
  ctx: TenantContext,
  id: string,
): Promise<DietDetail | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.diet)
    .where(and(eq(schema.diet.id, id), visibleDiet(ctx)));
  if (!row) return null;

  const meals = await ctx.db
    .select()
    .from(schema.dietMeal)
    .where(eq(schema.dietMeal.dietId, id))
    .orderBy(asc(schema.dietMeal.position), asc(schema.dietMeal.id));

  const mealIds = meals.map((m) => m.id);

  // Item rows joined to their food (one query for the whole diet).
  const itemRows = mealIds.length
    ? await ctx.db
        .select({
          id: schema.dietMealItem.id,
          mealId: schema.dietMealItem.dietMealId,
          grams: schema.dietMealItem.grams,
          measureLabel: schema.dietMealItem.measureLabel,
          measureGrams: schema.dietMealItem.measureGrams,
          position: schema.dietMealItem.position,
          foodId: schema.food.id,
          description: schema.food.description,
          code: schema.food.code,
          clinicId: schema.food.clinicId,
          energyKcal: schema.food.energyKcal,
          protein: schema.food.protein,
          carbohydrate: schema.food.carbohydrate,
          fat: schema.food.fat,
        })
        .from(schema.dietMealItem)
        .innerJoin(schema.food, eq(schema.dietMealItem.foodId, schema.food.id))
        .where(inArray(schema.dietMealItem.dietMealId, mealIds))
        .orderBy(asc(schema.dietMealItem.position), asc(schema.dietMealItem.id))
    : [];

  const itemIds = itemRows.map((i) => i.id);

  // Substitute rows joined to their food (one query for the whole diet).
  const subRows = itemIds.length
    ? await ctx.db
        .select({
          id: schema.dietMealItemSubstitute.id,
          itemId: schema.dietMealItemSubstitute.dietMealItemId,
          grams: schema.dietMealItemSubstitute.grams,
          measureLabel: schema.dietMealItemSubstitute.measureLabel,
          measureGrams: schema.dietMealItemSubstitute.measureGrams,
          position: schema.dietMealItemSubstitute.position,
          foodId: schema.food.id,
          description: schema.food.description,
          code: schema.food.code,
          clinicId: schema.food.clinicId,
          energyKcal: schema.food.energyKcal,
          protein: schema.food.protein,
          carbohydrate: schema.food.carbohydrate,
          fat: schema.food.fat,
        })
        .from(schema.dietMealItemSubstitute)
        .innerJoin(
          schema.food,
          eq(schema.dietMealItemSubstitute.foodId, schema.food.id),
        )
        .where(inArray(schema.dietMealItemSubstitute.dietMealItemId, itemIds))
        .orderBy(
          asc(schema.dietMealItemSubstitute.position),
          asc(schema.dietMealItemSubstitute.id),
        )
    : [];

  const subsByItem = new Map<string, DietItemSubstitute[]>();
  for (const s of subRows) {
    const list = subsByItem.get(s.itemId) ?? [];
    list.push({
      id: s.id,
      foodId: s.foodId,
      description: s.description,
      code: s.code,
      origin: s.clinicId === null ? "base" : "clinic",
      grams: s.grams,
      measureLabel: s.measureLabel,
      measureGrams: s.measureGrams,
      macros: {
        energyKcal: scale(s.energyKcal, s.grams),
        protein: scale(s.protein, s.grams),
        carbohydrate: scale(s.carbohydrate, s.grams),
        fat: scale(s.fat, s.grams),
      },
    });
    subsByItem.set(s.itemId, list);
  }

  // The catalog substitutes (base + this clinic's) for the item foods, so the
  // detail can show the swaps available for each food — one query for the diet.
  const itemFoodIds = [...new Set(itemRows.map((i) => i.foodId))];
  const catalogRows = itemFoodIds.length
    ? await ctx.db
        .select({
          foodId: schema.foodSubstitution.foodId,
          grams: schema.foodSubstitution.grams,
          subFoodId: schema.food.id,
          description: schema.food.description,
        })
        .from(schema.foodSubstitution)
        .innerJoin(
          schema.food,
          eq(schema.foodSubstitution.substituteFoodId, schema.food.id),
        )
        .where(
          and(
            inArray(schema.foodSubstitution.foodId, itemFoodIds),
            or(
              isNull(schema.foodSubstitution.clinicId),
              eq(schema.foodSubstitution.clinicId, ctx.clinicId),
            ),
          ),
        )
    : [];

  const catalogByFood = new Map<string, DietFoodSubstitute[]>();
  for (const r of catalogRows) {
    const list = catalogByFood.get(r.foodId) ?? [];
    list.push({ foodId: r.subFoodId, description: r.description, grams: r.grams });
    catalogByFood.set(r.foodId, list);
  }

  const itemsByMeal = new Map<string, DietItem[]>();
  for (const it of itemRows) {
    const list = itemsByMeal.get(it.mealId) ?? [];
    list.push({
      id: it.id,
      foodId: it.foodId,
      description: it.description,
      code: it.code,
      origin: it.clinicId === null ? "base" : "clinic",
      grams: it.grams,
      measureLabel: it.measureLabel,
      measureGrams: it.measureGrams,
      macros: {
        energyKcal: scale(it.energyKcal, it.grams),
        protein: scale(it.protein, it.grams),
        carbohydrate: scale(it.carbohydrate, it.grams),
        fat: scale(it.fat, it.grams),
      },
      substitutes: subsByItem.get(it.id) ?? [],
      foodSubstitutes: catalogByFood.get(it.foodId) ?? [],
    });
    itemsByMeal.set(it.mealId, list);
  }

  const mealDetails: DietMealDetail[] = meals.map((m) => {
    const items = itemsByMeal.get(m.id) ?? [];
    return {
      id: m.id,
      name: m.name,
      time: m.time,
      position: m.position,
      items,
      totals: sumMacros(items.map((i) => i.macros)),
    };
  });

  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    origin: row.clinicId === null ? "base" : "clinic",
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    meals: mealDetails,
    totals: sumMacros(mealDetails.map((m) => m.totals)),
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes (clinic-owned diets only)                                          */
/* -------------------------------------------------------------------------- */

/** One substitute in a write payload. */
export type DietSubstituteInput = {
  foodId: string;
  grams: number;
  measureLabel?: string | null;
  measureGrams?: number | null;
};

/** One meal item in a write payload, with its substitutes. */
export type DietItemInput = {
  foodId: string;
  grams: number;
  measureLabel?: string | null;
  measureGrams?: number | null;
  substitutes: DietSubstituteInput[];
};

/** One meal in a write payload, with its items. */
export type DietMealInput = {
  name: string;
  time: string | null;
  items: DietItemInput[];
};

/** The full diet write payload (the whole tree). */
export type DietWriteInput = {
  name: string;
  notes: string | null;
  meals: DietMealInput[];
};

/** Outcome of a create/update — a friendly reason on the failure paths. */
export type DietWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid_food" };

/** Every distinct foodId referenced by a write payload (items + substitutes). */
function referencedFoodIds(input: DietWriteInput): string[] {
  const ids = new Set<string>();
  for (const meal of input.meals) {
    for (const item of meal.items) {
      ids.add(item.foodId);
      for (const sub of item.substitutes) ids.add(sub.foodId);
    }
  }
  return [...ids];
}

/**
 * Whether every referenced food is visible to this clinic (a base food or one
 * of its own). A payload referencing a food from another clinic — or a
 * non-existent id — fails this check, so a diet can never point at data the
 * clinic can't see.
 */
async function allFoodsVisible(
  ctx: TenantContext,
  db: DB,
  foodIds: string[],
): Promise<boolean> {
  if (foodIds.length === 0) return true;
  const rows = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(
      and(
        inArray(schema.food.id, foodIds),
        or(isNull(schema.food.clinicId), eq(schema.food.clinicId, ctx.clinicId)),
      ),
    );
  return rows.length === foodIds.length;
}

/**
 * Inserts a diet's meal/item/substitute tree, stamping `position` from array
 * order. Assumes the diet row already exists (and, for updates, that its old
 * tree was removed). Runs inside the caller's transaction.
 */
async function insertTree(
  db: Tx,
  dietId: string,
  meals: DietMealInput[],
): Promise<void> {
  for (const [mealPos, meal] of meals.entries()) {
    const [insertedMeal] = await db
      .insert(schema.dietMeal)
      .values({
        dietId,
        name: meal.name,
        time: meal.time,
        position: mealPos,
      })
      .returning({ id: schema.dietMeal.id });

    for (const [itemPos, item] of meal.items.entries()) {
      const [insertedItem] = await db
        .insert(schema.dietMealItem)
        .values({
          dietMealId: insertedMeal.id,
          foodId: item.foodId,
          grams: item.grams,
          measureLabel: item.measureLabel ?? null,
          measureGrams: item.measureGrams ?? null,
          position: itemPos,
        })
        .returning({ id: schema.dietMealItem.id });

      if (item.substitutes.length) {
        await db.insert(schema.dietMealItemSubstitute).values(
          item.substitutes.map((sub, subPos) => ({
            dietMealItemId: insertedItem.id,
            foodId: sub.foodId,
            grams: sub.grams,
            measureLabel: sub.measureLabel ?? null,
            measureGrams: sub.measureGrams ?? null,
            position: subPos,
          })),
        );
      }
    }
  }
}

/**
 * Creates a clinic-owned diet with its full tree. `clinicId` is stamped from the
 * context and `coachId` from the acting user — never from client input. Returns
 * `invalid_food` when any referenced food isn't visible to the clinic.
 */
export async function createDiet(
  ctx: TenantContext,
  input: DietWriteInput,
): Promise<DietWriteResult> {
  if (!(await allFoodsVisible(ctx, ctx.db, referencedFoodIds(input)))) {
    return { ok: false, reason: "invalid_food" };
  }

  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.diet)
      .values({
        clinicId: ctx.clinicId,
        coachId: ctx.userId,
        name: input.name,
        notes: input.notes,
      })
      .returning({ id: schema.diet.id });
    await insertTree(tx, row.id, input.meals);
    return row.id;
  });

  return { ok: true, id };
}

/**
 * Updates one of this clinic's own diets, replacing its whole tree. Scoped to
 * `clinic_id = ctx.clinicId`, so a base template or another clinic's diet is
 * never matched (returns `not_found`). The old meals/items/substitutes are
 * deleted (cascade) and re-inserted from the payload, transactionally.
 */
export async function updateDiet(
  ctx: TenantContext,
  id: string,
  input: DietWriteInput,
): Promise<DietWriteResult> {
  if (!(await allFoodsVisible(ctx, ctx.db, referencedFoodIds(input)))) {
    return { ok: false, reason: "invalid_food" };
  }

  const ok = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.diet)
      .set({ name: input.name, notes: input.notes, updatedAt: new Date() })
      .where(and(eq(schema.diet.id, id), eq(schema.diet.clinicId, ctx.clinicId)))
      .returning({ id: schema.diet.id });
    if (!row) return false;

    // Replace the tree: deleting the meals cascades to items and substitutes.
    await tx.delete(schema.dietMeal).where(eq(schema.dietMeal.dietId, id));
    await insertTree(tx, id, input.meals);
    return true;
  });

  return ok ? { ok: true, id } : { ok: false, reason: "not_found" };
}

/**
 * Soft-removes one of this clinic's diets (archived diets drop out of the
 * listing but keep their rows). Only the clinic's own diets can be archived;
 * base templates are read-only. Returns false when the id isn't own.
 */
export async function archiveDiet(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.diet)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.diet.id, id), eq(schema.diet.clinicId, ctx.clinicId)))
    .returning({ id: schema.diet.id });
  return rows.length > 0;
}

/** Restores one of this clinic's archived diets. Returns false when not own. */
export async function unarchiveDiet(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.diet)
    .set({ archived: false, updatedAt: new Date() })
    .where(and(eq(schema.diet.id, id), eq(schema.diet.clinicId, ctx.clinicId)))
    .returning({ id: schema.diet.id });
  return rows.length > 0;
}
