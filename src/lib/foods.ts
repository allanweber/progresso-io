import { z } from "@/lib/validation";

/**
 * Client-safe food-catalog domain: the DTOs the Bibliotecas screens read and
 * the zod schema the listing API validates its query with. No server/database
 * import, so it bundles into the client pages.
 */

export type FoodOrigin = "base" | "clinic";
export type FoodType = "ingrediente" | "preparacao";

export const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  ingrediente: "Ingrediente",
  preparacao: "Preparação",
};

export const ORIGIN_LABELS: Record<FoodOrigin, string> = {
  base: "base",
  clinic: "própria",
};

/** Sortable columns exposed to the listing (whitelist, mirrors the DAL). */
export const FOOD_SORTS = [
  "description",
  "energyKcal",
  "protein",
  "carbohydrate",
  "fat",
  "fiber",
] as const;

/**
 * Query for the Alimentos listing. All optional. `page`/`pageSize` are coerced
 * from the query string. Validated on the server before hitting the DAL.
 */
export const foodListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  group: z.string().trim().max(80).optional(),
  type: z.enum(["ingrediente", "preparacao"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(FOOD_SORTS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type FoodListQuery = z.output<typeof foodListQuerySchema>;

/** A row in the Alimentos listing (per 100 g; hot macros only). */
export type FoodListItemDto = {
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

export type FoodListResponse = {
  items: FoodListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type FoodGroupOption = { name: string; slug: string };

export type FoodNutrientDto = {
  id: string;
  label: string;
  unit: string;
  kind: string;
  value: number | null;
  isTrace: boolean;
};

export type FoodSubstituteDto = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  grams: number;
  origin: FoodOrigin;
};

/** A food's detail page: identity + full profile + substitutes (per 100 g). */
export type FoodDetailDto = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: FoodOrigin;
  archived: boolean;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  nutrients: FoodNutrientDto[];
  substitutes: FoodSubstituteDto[];
};

/** Formats a per-100 g value for display: "12,3 g", "tr", or "—". */
export function formatNutrient(
  value: number | null,
  unit: string,
  isTrace = false,
): string {
  if (value === null) return isTrace ? "tr" : "—";
  const n = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");
  return `${n.replace(".", ",")} ${unit}`;
}
