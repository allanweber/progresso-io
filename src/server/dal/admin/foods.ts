import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Food, FoodType } from "@/db/schema";
import type {
  FoodMeasureRow,
  FoodNutrientRow,
  FoodSubstituteRow,
} from "@/server/dal/foods";

/**
 * Platform-admin food catalog — cross-tenant reads, base-catalog writes.
 *
 * The admin sees EVERY food — the shared base (`clinic_id IS NULL`) and every
 * clinic's custom foods — but only ever WRITES the base: creates, edits and
 * archives touch `clinic_id IS NULL` rows exclusively, and base substitutions
 * are stamped `clinic_id = NULL`. A clinic's own food/rule is never mutated
 * here (read-only cross-clinic view).
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

const FOOD_SORTABLE = {
  description: schema.food.description,
  energyKcal: schema.food.energyKcal,
  protein: schema.food.protein,
  carbohydrate: schema.food.carbohydrate,
  fat: schema.food.fat,
  fiber: schema.food.fiber,
} as const;
export type AdminFoodSort = keyof typeof FOOD_SORTABLE;

export type AdminFoodOrigin = "base" | "clinic";

/** A row in the admin's cross-clinic food listing (per 100 g; hot macros). */
export type AdminFoodListItem = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  /** Number of shared base substitutions (`clinic_id NULL`) for this food. */
  substituteCount: number;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

export type AdminFoodListParams = {
  search?: string;
  groupSlug?: string;
  type?: FoodType;
  /** base = shared catalog; clinic = any clinic's own. */
  origin?: AdminFoodOrigin;
  /** Restrict to one clinic's custom foods. */
  clinicId?: string;
  /** Include archived foods (default false). */
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sort?: AdminFoodSort;
  dir?: "asc" | "desc";
};

export type AdminFoodListResult = {
  items: AdminFoodListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const A_DEFAULT_PAGE_SIZE = 25;
const A_MAX_PAGE_SIZE = 100;

/** Shared WHERE for the admin listing: filters, no tenant scope (admin sees all). */
function adminFoodWhere(params: AdminFoodListParams) {
  const conds: SQL[] = [];
  if (!params.includeArchived) conds.push(eq(schema.food.archived, false));
  if (params.groupSlug) conds.push(eq(schema.foodGroup.slug, params.groupSlug));
  if (params.type) conds.push(eq(schema.food.type, params.type));
  if (params.origin === "base") conds.push(isNull(schema.food.clinicId));
  if (params.origin === "clinic") conds.push(isNotNull(schema.food.clinicId));
  if (params.clinicId) conds.push(eq(schema.food.clinicId, params.clinicId));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.food.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Every food on the platform (base + all clinics), filtered and paginated.
 * Cross-tenant by design — admin only. Each clinic food carries its clinic name.
 */
export async function listAllFoods(
  db: DB,
  params: AdminFoodListParams = {},
): Promise<AdminFoodListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    A_MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? A_DEFAULT_PAGE_SIZE)),
  );
  const where = adminFoodWhere(params);
  const term = params.search?.trim();

  const orderBy = term
    ? [
        desc(sql`similarity(${schema.food.searchText}, unaccent(lower(${term})))`),
        asc(schema.food.description),
      ]
    : [
        (params.dir === "desc" ? desc : asc)(
          FOOD_SORTABLE[params.sort ?? "description"],
        ),
        asc(schema.food.id),
      ];

  const rows = await db
    .select({
      id: schema.food.id,
      code: schema.food.code,
      description: schema.food.description,
      type: schema.food.type,
      clinicId: schema.food.clinicId,
      clinicName: schema.clinic.name,
      archived: schema.food.archived,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
      // Shared base substitutions attached to this food (the admin-managed ones).
      substituteCount: sql<number>`(
        select count(*)::int from food_substitution fs
        where fs.food_id = ${schema.food.id} and fs.clinic_id is null
      )`,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
      fiber: schema.food.fiber,
      sodium: schema.food.sodium,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .leftJoin(schema.clinic, eq(schema.food.clinicId, schema.clinic.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(where);

  const items: AdminFoodListItem[] = rows.map(
    ({ clinicId, clinicName, ...r }) => ({
      ...r,
      origin: clinicId === null ? "base" : "clinic",
      clinicName: clinicId === null ? null : clinicName,
    }),
  );

  return { items, total, page, pageSize };
}

export type AdminFoodDetail = Food & {
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  nutrients: FoodNutrientRow[];
  /** Base substitutions (`clinic_id NULL`) for the food — admin-managed. */
  substitutes: FoodSubstituteRow[];
  /** Base measures (`clinic_id NULL`) for the food — admin-managed. */
  measures: FoodMeasureRow[];
};

/**
 * Any single food (base or any clinic's), with group, clinic name, full profile
 * and the food's **base** substitutions (the ones the admin manages). Cross-
 * tenant — admin only. Returns null when the id doesn't exist.
 */
export async function getAnyFood(
  db: DB,
  id: string,
): Promise<AdminFoodDetail | null> {
  const [row] = await db
    .select({
      food: schema.food,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
      clinicName: schema.clinic.name,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .leftJoin(schema.clinic, eq(schema.food.clinicId, schema.clinic.id))
    .where(eq(schema.food.id, id));
  if (!row) return null;

  const nutrients = await db
    .select({
      id: schema.nutrient.id,
      label: schema.nutrient.label,
      unit: schema.nutrient.unit,
      kind: schema.nutrient.kind,
      value: schema.foodNutrient.value,
      isTrace: schema.foodNutrient.isTrace,
    })
    .from(schema.foodNutrient)
    .innerJoin(
      schema.nutrient,
      eq(schema.foodNutrient.nutrientId, schema.nutrient.id),
    )
    .where(eq(schema.foodNutrient.foodId, id))
    .orderBy(asc(schema.nutrient.sortOrder));

  const substitute = schema.food;
  const subs = await db
    .select({
      id: schema.foodSubstitution.id,
      grams: schema.foodSubstitution.grams,
      foodId: substitute.id,
      description: substitute.description,
      code: substitute.code,
      clinicId: substitute.clinicId,
    })
    .from(schema.foodSubstitution)
    .innerJoin(
      substitute,
      eq(schema.foodSubstitution.substituteFoodId, substitute.id),
    )
    .where(
      and(
        eq(schema.foodSubstitution.foodId, id),
        isNull(schema.foodSubstitution.clinicId),
      ),
    )
    .orderBy(asc(substitute.description));

  // Base measures the admin manages (clinic_id NULL only).
  const measureRows = await db
    .select({
      id: schema.foodMeasure.id,
      label: schema.foodMeasure.label,
      grams: schema.foodMeasure.grams,
      isDefault: schema.foodMeasure.isDefault,
    })
    .from(schema.foodMeasure)
    .where(
      and(
        eq(schema.foodMeasure.foodId, id),
        isNull(schema.foodMeasure.clinicId),
      ),
    )
    .orderBy(desc(schema.foodMeasure.isDefault), asc(schema.foodMeasure.grams));

  return {
    ...row.food,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    origin: row.food.clinicId === null ? "base" : "clinic",
    clinicName: row.food.clinicId === null ? null : row.clinicName,
    nutrients,
    substitutes: subs.map(({ clinicId, ...s }) => ({
      ...s,
      origin: clinicId === null ? "base" : "clinic",
      removable: true, // every base substitution is admin-removable
    })),
    measures: measureRows.map((m) => ({
      ...m,
      origin: "base" as const,
      removable: true, // every base measure is admin-removable
    })),
  };
}

/** The editable fields of a base food (same "enxuto" shape as the coach form). */
export type BaseFoodInput = {
  description: string;
  groupSlug: string;
  type: FoodType;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

async function adminGroupId(db: DB, slug: string): Promise<string | null> {
  const [g] = await db
    .select({ id: schema.foodGroup.id })
    .from(schema.foodGroup)
    .where(eq(schema.foodGroup.slug, slug));
  return g?.id ?? null;
}

async function anyFoodExists(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(eq(schema.food.id, id));
  return Boolean(row);
}

function baseMacros(input: BaseFoodInput) {
  return {
    energyKcal: input.energyKcal,
    protein: input.protein,
    carbohydrate: input.carbohydrate,
    fat: input.fat,
    fiber: input.fiber,
    sodium: input.sodium,
  };
}

/** Creates a shared base food (`clinic_id NULL`, `source = "custom"`). */
export async function createBaseFood(
  db: DB,
  input: BaseFoodInput,
): Promise<Food | null> {
  const groupId = await adminGroupId(db, input.groupSlug);
  if (!groupId) return null;
  const [row] = await db
    .insert(schema.food)
    .values({
      clinicId: null,
      code: null,
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      source: "custom",
      ...baseMacros(input),
    })
    .returning();
  return row;
}

/**
 * Edits a shared base food. Scoped to `clinic_id IS NULL`, so a clinic's own
 * food is never touched (returns null — a 404 at the route).
 */
export async function updateBaseFood(
  db: DB,
  id: string,
  input: BaseFoodInput,
): Promise<Food | null> {
  const groupId = await adminGroupId(db, input.groupSlug);
  if (!groupId) return null;
  const [row] = await db
    .update(schema.food)
    .set({
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      ...baseMacros(input),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

/** Archives a shared base food (`clinic_id IS NULL` only). */
export async function archiveBaseFood(
  db: DB,
  id: string,
): Promise<Food | null> {
  const [row] = await db
    .update(schema.food)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

/** Restores (unarchives) a shared base food (`clinic_id IS NULL` only). */
export async function unarchiveBaseFood(
  db: DB,
  id: string,
): Promise<Food | null> {
  const [row] = await db
    .update(schema.food)
    .set({ archived: false, updatedAt: new Date() })
    .where(and(eq(schema.food.id, id), isNull(schema.food.clinicId)))
    .returning();
  return row ?? null;
}

export type AddBaseSubstitutionResult =
  | { ok: true; substitute: FoodSubstituteRow }
  | {
      ok: false;
      reason: "food_not_found" | "substitute_not_found" | "same_food" | "duplicate";
    };

/**
 * Adds a **base** substitution rule (`clinic_id NULL`): `grams` of the
 * substitute replace 100 g of the food. Both foods may be any food on the
 * platform; the rule itself is shared/base.
 */
export async function addBaseSubstitution(
  db: DB,
  foodId: string,
  substituteFoodId: string,
  grams: number,
): Promise<AddBaseSubstitutionResult> {
  if (foodId === substituteFoodId) return { ok: false, reason: "same_food" };
  if (!(await anyFoodExists(db, foodId))) {
    return { ok: false, reason: "food_not_found" };
  }
  if (!(await anyFoodExists(db, substituteFoodId))) {
    return { ok: false, reason: "substitute_not_found" };
  }
  const [dupe] = await db
    .select({ id: schema.foodSubstitution.id })
    .from(schema.foodSubstitution)
    .where(
      and(
        isNull(schema.foodSubstitution.clinicId),
        eq(schema.foodSubstitution.foodId, foodId),
        eq(schema.foodSubstitution.substituteFoodId, substituteFoodId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await db
    .insert(schema.foodSubstitution)
    .values({ clinicId: null, foodId, substituteFoodId, grams })
    .returning();
  const [sub] = await db
    .select({
      description: schema.food.description,
      code: schema.food.code,
      clinicId: schema.food.clinicId,
    })
    .from(schema.food)
    .where(eq(schema.food.id, substituteFoodId));

  return {
    ok: true,
    substitute: {
      id: ins.id,
      foodId: substituteFoodId,
      description: sub.description,
      code: sub.code,
      grams: ins.grams,
      origin: sub.clinicId === null ? "base" : "clinic",
      removable: true,
    },
  };
}

/**
 * Adds a **base** household measure (`clinic_id NULL`) to any food. Admin-only,
 * cross-tenant. Returns null when the food doesn't exist.
 */
export async function addBaseMeasure(
  db: DB,
  foodId: string,
  input: { label: string; grams: number; isDefault: boolean },
): Promise<FoodMeasureRow | null> {
  if (!(await anyFoodExists(db, foodId))) return null;
  const [ins] = await db
    .insert(schema.foodMeasure)
    .values({
      clinicId: null,
      foodId,
      label: input.label,
      grams: input.grams,
      isDefault: input.isDefault,
    })
    .returning();
  return {
    id: ins.id,
    label: ins.label,
    grams: ins.grams,
    isDefault: ins.isDefault,
    origin: "base",
    removable: true,
  };
}

/** Removes a **base** household measure (`clinic_id NULL` only). */
export async function removeBaseMeasure(
  db: DB,
  foodId: string,
  measureId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.foodMeasure)
    .where(
      and(
        eq(schema.foodMeasure.id, measureId),
        eq(schema.foodMeasure.foodId, foodId),
        isNull(schema.foodMeasure.clinicId),
      ),
    )
    .returning({ id: schema.foodMeasure.id });
  return deleted.length > 0;
}

/** Removes a **base** substitution rule (`clinic_id NULL` only). */
export async function removeBaseSubstitution(
  db: DB,
  foodId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.foodSubstitution)
    .where(
      and(
        eq(schema.foodSubstitution.id, substitutionId),
        eq(schema.foodSubstitution.foodId, foodId),
        isNull(schema.foodSubstitution.clinicId),
      ),
    )
    .returning({ id: schema.foodSubstitution.id });
  return deleted.length > 0;
}

/** The canonical food groups (for the admin listing/form filters). */
export async function listFoodGroups(
  db: DB,
): Promise<{ name: string; slug: string }[]> {
  return db
    .select({ name: schema.foodGroup.name, slug: schema.foodGroup.slug })
    .from(schema.foodGroup)
    .orderBy(asc(schema.foodGroup.name));
}
