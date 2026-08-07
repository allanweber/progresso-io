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
  // Restrict to this clinic's favorites (the route pre-coerces "true" → true).
  favorite: z.boolean().optional(),
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
  isFavorite: boolean;
  /** Substitutes visible to the clinic for this food (base + own). */
  substituteCount: number;
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
  /** Whether the current clinic may delete this substitution rule. */
  removable: boolean;
};

/** A household measure (medida caseira): `grams` equal one `label`. */
export type FoodMeasureDto = {
  id: string;
  label: string;
  grams: number;
  isDefault: boolean;
  origin: FoodOrigin;
  /** Whether the current viewer may delete this measure. */
  removable: boolean;
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
  isFavorite: boolean;
  archived: boolean;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  nutrients: FoodNutrientDto[];
  substitutes: FoodSubstituteDto[];
  measures: FoodMeasureDto[];
};

/* -------------------------------------------------------------------------- */
/*  Write schemas (phase 2 — custom foods, substitutions, favorites)           */
/* -------------------------------------------------------------------------- */

/**
 * A per-100 g macro field. The form always sends a string (possibly empty), so
 * the input type is `string` — which keeps it compatible with TanStack Form's
 * string field values. An empty value becomes null (unmeasured); a decimal comma
 * is accepted, so "12,3" parses like "12.3". Rejects negatives / absurd values.
 */
const macroField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .pipe(
    z
      .number({ error: "Valor inválido." })
      .min(0, "Não pode ser negativo.")
      .max(100_000, "Valor muito alto.")
      .nullable(),
  );

/**
 * The "enxuto" custom-food form — the six hot macros only, no full profile.
 * Shared by the create/edit API routes and the TanStack Form. `groupSlug`
 * (not the internal id) is what the form and the API exchange.
 */
export const foodFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Informe o nome do alimento.")
    .max(200, "Nome muito longo."),
  groupSlug: z.string().trim().min(1, "Selecione um grupo."),
  type: z.enum(["ingrediente", "preparacao"]),
  energyKcal: macroField,
  protein: macroField,
  carbohydrate: macroField,
  fat: macroField,
  fiber: macroField,
  sodium: macroField,
});

export type FoodFormInput = z.input<typeof foodFormSchema>;
export type FoodFormValues = z.output<typeof foodFormSchema>;

/**
 * Adding a substitution: which food substitutes the main one, and the grams of
 * it equivalent to 100 g of the main food.
 */
export const substitutionFormSchema = z.object({
  substituteFoodId: z.string().uuid("Selecione um alimento substituto."),
  grams: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z
      .number({ error: "Informe as gramas." })
      .positive("As gramas devem ser maiores que zero.")
      .max(100_000, "Valor muito alto."),
  ),
});
export type SubstitutionFormValues = z.output<typeof substitutionFormSchema>;

/** Adding a household measure to a food: a name and its grams. */
export const measureFormSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Informe o nome da medida.")
    .max(40, "Nome muito longo."),
  grams: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z
      .number({ error: "Informe as gramas." })
      .positive("As gramas devem ser maiores que zero.")
      .max(100_000, "Valor muito alto."),
  ),
  isDefault: z.boolean().optional().default(false),
});
export type MeasureFormValues = z.output<typeof measureFormSchema>;

/** Toggle a food's favorite state for the clinic. */
export const favoriteSchema = z.object({ favorite: z.boolean() });

/** The subset of a created/updated food the client needs (to navigate). */
export type FoodMutationResponse = { food: { id: string } };

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
