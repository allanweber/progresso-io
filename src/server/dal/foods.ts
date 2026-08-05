import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";

import { schema } from "@/db";
import type { Food, FoodType, NutrientKind } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Food-catalog DAL. The catalog is reference data: a `food` row with
 * `clinicId = null` is the shared TBCA base, a row with `clinicId` set is a
 * clinic's own custom food. Every read here is scoped to
 * `clinicId IS NULL OR clinicId = ctx.clinicId`, so a clinic sees the base plus
 * only its own custom foods — never another clinic's. Writes (phase 2/3) always
 * stamp `ctx.clinicId`.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Columns the listing may be sorted by (whitelist — never trust raw input). */
const SORTABLE = {
  description: schema.food.description,
  energyKcal: schema.food.energyKcal,
  protein: schema.food.protein,
  carbohydrate: schema.food.carbohydrate,
  fat: schema.food.fat,
  fiber: schema.food.fiber,
} as const;
export type FoodSort = keyof typeof SORTABLE;

/** Whether a food is from the shared base catalog or the clinic's own. */
export type FoodOrigin = "base" | "clinic";

/** A row in the Alimentos listing (per 100 g; hot macros only). */
export type FoodListItem = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: FoodOrigin;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

export type FoodListParams = {
  search?: string;
  groupSlug?: string;
  type?: FoodType;
  page?: number;
  pageSize?: number;
  sort?: FoodSort;
  dir?: "asc" | "desc";
};

export type FoodListResult = {
  items: FoodListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Builds the shared WHERE for a listing: tenant scope + not archived + filters. */
function listWhere(ctx: TenantContext, params: FoodListParams) {
  const conds = [
    or(isNull(schema.food.clinicId), eq(schema.food.clinicId, ctx.clinicId)),
    eq(schema.food.archived, false),
  ];
  if (params.groupSlug) conds.push(eq(schema.foodGroup.slug, params.groupSlug));
  if (params.type) conds.push(eq(schema.food.type, params.type));
  const term = params.search?.trim();
  if (term) {
    // Each whitespace token must appear in the (already unaccented) search_text.
    // `unaccent(lower(token))` matches how search_text was built at seed time,
    // so accents and case don't matter; the GIN trigram index accelerates it.
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.food.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return and(...conds);
}

/**
 * A page of the catalog visible to this clinic (base + own custom), excluding
 * archived foods. When `search` is set, results are ranked by trigram
 * similarity; otherwise by the requested sortable column (default description).
 */
export async function listFoods(
  ctx: TenantContext,
  params: FoodListParams = {},
): Promise<FoodListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = listWhere(ctx, params);
  const term = params.search?.trim();

  const orderBy = term
    ? [desc(sql`similarity(${schema.food.searchText}, unaccent(lower(${term})))`), asc(schema.food.description)]
    : [
        (params.dir === "desc" ? desc : asc)(
          SORTABLE[params.sort ?? "description"],
        ),
        asc(schema.food.id),
      ];

  const rows = await ctx.db
    .select({
      id: schema.food.id,
      code: schema.food.code,
      description: schema.food.description,
      type: schema.food.type,
      clinicId: schema.food.clinicId,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
      fiber: schema.food.fiber,
      sodium: schema.food.sodium,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(where);

  const items: FoodListItem[] = rows.map(({ clinicId, ...r }) => ({
    ...r,
    origin: clinicId === null ? "base" : "clinic",
  }));

  return { items, total, page, pageSize };
}

/** One nutrient of a food's full profile (per 100 g), ordered for display. */
export type FoodNutrientRow = {
  id: string;
  label: string;
  unit: string;
  kind: NutrientKind;
  value: number | null;
  isTrace: boolean;
};

/** A substitute offered for a food: `grams` replace 100 g of the main food. */
export type FoodSubstituteRow = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  grams: number;
  origin: FoodOrigin;
};

export type FoodDetail = Food & {
  groupName: string;
  groupSlug: string;
  origin: FoodOrigin;
  nutrients: FoodNutrientRow[];
  substitutes: FoodSubstituteRow[];
};

/**
 * A single food with its group, full nutrient profile (ordered), and the
 * substitutes visible to this clinic (base + own). Returns null when the id is
 * neither a base food nor one of this clinic's own.
 */
export async function getFood(
  ctx: TenantContext,
  id: string,
): Promise<FoodDetail | null> {
  const [row] = await ctx.db
    .select({
      food: schema.food,
      groupName: schema.foodGroup.name,
      groupSlug: schema.foodGroup.slug,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(
      and(
        eq(schema.food.id, id),
        or(isNull(schema.food.clinicId), eq(schema.food.clinicId, ctx.clinicId)),
      ),
    );
  if (!row) return null;

  const nutrients = await ctx.db
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
  const subs = await ctx.db
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
        or(
          isNull(schema.foodSubstitution.clinicId),
          eq(schema.foodSubstitution.clinicId, ctx.clinicId),
        ),
      ),
    )
    .orderBy(asc(substitute.description));

  return {
    ...row.food,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    origin: row.food.clinicId === null ? "base" : "clinic",
    nutrients,
    substitutes: subs.map(({ clinicId, ...s }) => ({
      ...s,
      origin: clinicId === null ? "base" : "clinic",
    })),
  };
}

/** The 17 canonical food groups (for the listing's group filter). */
export async function listFoodGroups(
  ctx: TenantContext,
): Promise<{ name: string; slug: string }[]> {
  return ctx.db
    .select({ name: schema.foodGroup.name, slug: schema.foodGroup.slug })
    .from(schema.foodGroup)
    .orderBy(asc(schema.foodGroup.name));
}
