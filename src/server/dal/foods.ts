import { and, asc, count, desc, eq, exists, isNull, or, sql } from "drizzle-orm";

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
  isFavorite: boolean;
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
  /** Restrict to foods this clinic has favorited. */
  favoritesOnly?: boolean;
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
  if (params.favoritesOnly) {
    // Only foods this clinic has favorited. An EXISTS keeps the filter join-free
    // so the count query can reuse this WHERE unchanged.
    conds.push(
      exists(
        ctx.db
          .select({ x: sql`1` })
          .from(schema.foodFavorite)
          .where(
            and(
              eq(schema.foodFavorite.foodId, schema.food.id),
              eq(schema.foodFavorite.clinicId, ctx.clinicId),
            ),
          ),
      ),
    );
  }
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
      // NULL unless this clinic favorited the food (PK makes it at most one row).
      favClinicId: schema.foodFavorite.clinicId,
      energyKcal: schema.food.energyKcal,
      protein: schema.food.protein,
      carbohydrate: schema.food.carbohydrate,
      fat: schema.food.fat,
      fiber: schema.food.fiber,
      sodium: schema.food.sodium,
    })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .leftJoin(
      schema.foodFavorite,
      and(
        eq(schema.foodFavorite.foodId, schema.food.id),
        eq(schema.foodFavorite.clinicId, ctx.clinicId),
      ),
    )
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.food)
    .innerJoin(schema.foodGroup, eq(schema.food.groupId, schema.foodGroup.id))
    .where(where);

  const items: FoodListItem[] = rows.map(({ clinicId, favClinicId, ...r }) => ({
    ...r,
    origin: clinicId === null ? "base" : "clinic",
    isFavorite: favClinicId !== null,
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
  /** Origin of the substitute *food* (base TBCA or the clinic's own). */
  origin: FoodOrigin;
  /** Whether this clinic may delete the rule (only its own; base is read-only). */
  removable: boolean;
};

export type FoodDetail = Food & {
  groupName: string;
  groupSlug: string;
  origin: FoodOrigin;
  isFavorite: boolean;
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
      // The rule's own clinic: NULL = base substitution (read-only for a clinic).
      ruleClinicId: schema.foodSubstitution.clinicId,
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

  const [fav] = await ctx.db
    .select({ foodId: schema.foodFavorite.foodId })
    .from(schema.foodFavorite)
    .where(
      and(
        eq(schema.foodFavorite.clinicId, ctx.clinicId),
        eq(schema.foodFavorite.foodId, id),
      ),
    );

  return {
    ...row.food,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    origin: row.food.clinicId === null ? "base" : "clinic",
    isFavorite: Boolean(fav),
    nutrients,
    substitutes: subs.map(({ clinicId, ruleClinicId, ...s }) => ({
      ...s,
      origin: clinicId === null ? "base" : "clinic",
      removable: ruleClinicId === ctx.clinicId,
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

/* -------------------------------------------------------------------------- */
/*  Writes (phase 2 — clinic-owned custom foods, substitutions, favorites)     */
/*                                                                            */
/*  Every write stamps `ctx.clinicId` and scopes its WHERE by it, so a clinic  */
/*  can only ever touch its own custom rows. Base rows (`clinic_id IS NULL`)    */
/*  are never matched by an equality on `ctx.clinicId`, so they stay read-only. */
/* -------------------------------------------------------------------------- */

/** The editable fields of a custom food (the "enxuto" form; per 100 g). */
export type FoodWriteInput = {
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

/** Resolves a group slug to its id, or null when the slug is unknown. */
async function resolveGroupId(
  ctx: TenantContext,
  slug: string,
): Promise<string | null> {
  const [g] = await ctx.db
    .select({ id: schema.foodGroup.id })
    .from(schema.foodGroup)
    .where(eq(schema.foodGroup.slug, slug));
  return g?.id ?? null;
}

/** Whether a food is visible to this clinic (a base food or one of its own). */
async function foodVisibleToClinic(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(
      and(
        eq(schema.food.id, id),
        or(isNull(schema.food.clinicId), eq(schema.food.clinicId, ctx.clinicId)),
      ),
    );
  return Boolean(row);
}

/** The macro columns shared by create/update, mapped from the write input. */
function macroValues(input: FoodWriteInput) {
  return {
    energyKcal: input.energyKcal,
    protein: input.protein,
    carbohydrate: input.carbohydrate,
    fat: input.fat,
    fiber: input.fiber,
    sodium: input.sodium,
  };
}

/**
 * Creates a custom food for this clinic. `clinicId` is stamped from the context,
 * `code` is null (only base TBCA foods carry one), and `search_text` is computed
 * the same way the seed does so search stays accent-/case-blind. Returns null
 * only when the group slug is unknown (a validation guard).
 */
export async function createFood(
  ctx: TenantContext,
  input: FoodWriteInput,
): Promise<Food | null> {
  const groupId = await resolveGroupId(ctx, input.groupSlug);
  if (!groupId) return null;

  const [row] = await ctx.db
    .insert(schema.food)
    .values({
      // Tenant stamp — never from client input.
      clinicId: ctx.clinicId,
      code: null,
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      source: "custom",
      ...macroValues(input),
    })
    .returning();
  return row;
}

/**
 * Updates one of this clinic's own custom foods. Scoped to
 * `clinic_id = ctx.clinicId`, so a base food (null clinic) or another clinic's
 * food is never matched — returns null in that case (treated as a 404).
 */
export async function updateFood(
  ctx: TenantContext,
  id: string,
  input: FoodWriteInput,
): Promise<Food | null> {
  const groupId = await resolveGroupId(ctx, input.groupSlug);
  if (!groupId) return null;

  const [row] = await ctx.db
    .update(schema.food)
    .set({
      description: input.description,
      searchText: sql`unaccent(lower(${input.description}))`,
      groupId,
      type: input.type,
      ...macroValues(input),
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.food.id, id), eq(schema.food.clinicId, ctx.clinicId)),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-removes one of this clinic's custom foods (archived foods drop out of the
 * listing but keep their references). Only the clinic's own foods can be
 * archived; base foods are read-only. Returns null when the id isn't own.
 */
export async function archiveFood(
  ctx: TenantContext,
  id: string,
): Promise<Food | null> {
  const [row] = await ctx.db
    .update(schema.food)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(eq(schema.food.id, id), eq(schema.food.clinicId, ctx.clinicId)),
    )
    .returning();
  return row ?? null;
}

/** Outcome of adding a substitution — a friendly reason on the failure paths. */
export type AddSubstitutionResult =
  | { ok: true; substitute: FoodSubstituteRow }
  | {
      ok: false;
      reason: "food_not_found" | "substitute_not_found" | "same_food" | "duplicate";
    };

/**
 * Adds a clinic-owned substitution: `grams` of `substituteFoodId` replace 100 g
 * of `foodId`. Both foods must be visible to the clinic. The rule is stamped
 * with `ctx.clinicId`, so it never touches the shared base substitutions.
 */
export async function addSubstitution(
  ctx: TenantContext,
  foodId: string,
  substituteFoodId: string,
  grams: number,
): Promise<AddSubstitutionResult> {
  if (foodId === substituteFoodId) return { ok: false, reason: "same_food" };
  if (!(await foodVisibleToClinic(ctx, foodId))) {
    return { ok: false, reason: "food_not_found" };
  }
  if (!(await foodVisibleToClinic(ctx, substituteFoodId))) {
    return { ok: false, reason: "substitute_not_found" };
  }

  // One rule per (clinic, food, substitute) — don't stack duplicates.
  const [dupe] = await ctx.db
    .select({ id: schema.foodSubstitution.id })
    .from(schema.foodSubstitution)
    .where(
      and(
        eq(schema.foodSubstitution.clinicId, ctx.clinicId),
        eq(schema.foodSubstitution.foodId, foodId),
        eq(schema.foodSubstitution.substituteFoodId, substituteFoodId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await ctx.db
    .insert(schema.foodSubstitution)
    .values({ clinicId: ctx.clinicId, foodId, substituteFoodId, grams })
    .returning();

  const [sub] = await ctx.db
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
 * Removes one of this clinic's own substitution rules. Scoped to the clinic and
 * the main food, so base rules and other clinics' rules are never deleted.
 * Returns true when a row was removed.
 */
export async function removeSubstitution(
  ctx: TenantContext,
  foodId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await ctx.db
    .delete(schema.foodSubstitution)
    .where(
      and(
        eq(schema.foodSubstitution.id, substitutionId),
        eq(schema.foodSubstitution.foodId, foodId),
        eq(schema.foodSubstitution.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.foodSubstitution.id });
  return deleted.length > 0;
}

/**
 * Marks or unmarks a food as this clinic's favorite (idempotent). Only foods the
 * clinic can see may be favorited; returns false when the id isn't visible.
 */
export async function setFavorite(
  ctx: TenantContext,
  foodId: string,
  favorite: boolean,
): Promise<boolean> {
  if (!(await foodVisibleToClinic(ctx, foodId))) return false;

  if (favorite) {
    await ctx.db
      .insert(schema.foodFavorite)
      .values({ clinicId: ctx.clinicId, foodId })
      .onConflictDoNothing();
  } else {
    await ctx.db
      .delete(schema.foodFavorite)
      .where(
        and(
          eq(schema.foodFavorite.clinicId, ctx.clinicId),
          eq(schema.foodFavorite.foodId, foodId),
        ),
      );
  }
  return true;
}
