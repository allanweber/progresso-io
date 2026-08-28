import { MEAL_SLOT_LABELS, MEAL_SLOT_VALUES } from "@/lib/meals";
import { z } from "@/lib/validation";

/**
 * Client-safe diet domain: the DTOs the Dietas screens read and the zod schemas
 * the API validates with. No server/database import, so it bundles into the
 * client pages.
 */

export type DietOrigin = "base" | "clinic";

export const DIET_ORIGIN_LABELS: Record<DietOrigin, string> = {
  base: "base",
  clinic: "própria",
};

/**
 * Quick meal-name suggestions shown as chips in the builder. They only prefill
 * the free-text field — the coach can still type anything.
 *
 * Derived from the canonical slot list rather than retyped: this and the AI
 * generator's picker were two hand-maintained lists that had already drifted
 * (the builder offered Pré-treino, the generator could not produce it), so a
 * coach could hand-build a plan the AI was structurally unable to reproduce.
 */
export const MEAL_SUGGESTIONS = MEAL_SLOT_VALUES.map(
  (slot) => MEAL_SLOT_LABELS[slot],
);

/* -------------------------------------------------------------------------- */
/*  Read DTOs                                                                  */
/* -------------------------------------------------------------------------- */

/** Scaled macros of a food line (or a summed total). */
export type DietMacrosDto = {
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

/** A row in the Dietas listing. */
export type DietListItemDto = {
  id: string;
  name: string;
  origin: DietOrigin;
  archived: boolean;
  mealCount: number;
  itemCount: number;
  totalKcal: number;
  totalProtein: number;
  totalCarbohydrate: number;
  totalFat: number;
  /** ISO timestamp (JSON-serialized Date). */
  updatedAt: string;
};

export type DietListResponse = {
  items: DietListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type DietItemSubstituteDto = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  origin: DietOrigin;
  grams: number;
  /** How the quantity was entered: a medida caseira, or null for plain grams. */
  measureLabel: string | null;
  /** Grams of one of that measure (so a count = grams / measureGrams). */
  measureGrams: number | null;
  macros: DietMacrosDto;
};

/** A catalog substitute available for the item's food (reference, read-only). */
export type DietFoodSubstituteDto = {
  foodId: string;
  description: string;
  /** Grams of the substitute equivalent to 100 g of the item's food. */
  grams: number;
};

export type DietItemDto = {
  id: string;
  foodId: string;
  description: string;
  code: string | null;
  origin: DietOrigin;
  grams: number;
  /** How the quantity was entered: a medida caseira, or null for plain grams. */
  measureLabel: string | null;
  /** Grams of one of that measure (so a count = grams / measureGrams). */
  measureGrams: number | null;
  macros: DietMacrosDto;
  /** Coach-defined equivalences for this diet item. */
  substitutes: DietItemSubstituteDto[];
  /** The food's catalog substitutes (base + clinic), for reference. */
  foodSubstitutes: DietFoodSubstituteDto[];
};

export type DietMealDto = {
  id: string;
  name: string;
  time: string | null;
  position: number;
  items: DietItemDto[];
  totals: DietMacrosDto;
};

export type DietDetailDto = {
  id: string;
  name: string;
  notes: string | null;
  origin: DietOrigin;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  meals: DietMealDto[];
  totals: DietMacrosDto;
};

/** The subset of a created/updated diet the client needs (to navigate). */
export type DietMutationResponse = { diet: { id: string } };

/* -------------------------------------------------------------------------- */
/*  Query + write schemas                                                      */
/* -------------------------------------------------------------------------- */

/** Query for the Dietas listing. All optional; validated before the DAL. */
export const dietListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  // A bare/"true" flag includes archived diets; the route pre-coerces it.
  includeArchived: z.boolean().optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type DietListQuery = z.output<typeof dietListQuerySchema>;

/** Grams of a food line — a positive number (the client sends real numbers). */
const gramsSchema = z
  .number({ error: "Informe as gramas." })
  .positive("As gramas devem ser maiores que zero.")
  .max(100_000, "Valor muito alto.");

/**
 * Optional free text: accepts a string, null or undefined from JSON, trims it,
 * and normalizes an empty value to null.
 */
function optionalText(max: number, tooLong: string) {
  return z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .max(max, tooLong)
      .transform((v) => (v === "" ? null : v)),
  );
}

/** The optional medida-caseira snapshot on an item/substitute. */
const measureFields = {
  measureLabel: z
    .string()
    .trim()
    .max(40, "Medida muito longa.")
    .nullish()
    .transform((v) => (v ? v : null)),
  measureGrams: z
    .number()
    .positive()
    .max(100_000)
    .nullish()
    .transform((v) => (v == null ? null : v)),
};

const substituteSchema = z.object({
  foodId: z.string().uuid("Alimento inválido."),
  grams: gramsSchema,
  ...measureFields,
});

const itemSchema = z.object({
  foodId: z.string().uuid("Alimento inválido."),
  grams: gramsSchema,
  ...measureFields,
  substitutes: z.array(substituteSchema).max(20).default([]),
});

/**
 * Meal-shape limits, named because the builder enforces them too — it must not
 * let a coach create a diet the save would reject (a duplicated meal whose name
 * overflows, or a 31st meal).
 */
export const MEAL_NAME_MAX = 80;
export const DIET_MEALS_MAX = 30;

const mealSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da refeição.")
    .max(MEAL_NAME_MAX, "Nome muito longo."),
  time: optionalText(20, "Horário muito longo."),
  items: z.array(itemSchema).max(100).default([]),
});

/**
 * The full diet write payload (the whole tree), shared by the create/edit API
 * routes. `name` is required; everything else may be empty, so a coach can save
 * a draft with no meals yet. Its output matches the DAL's `DietWriteInput`.
 */
export const dietFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da dieta.")
    .max(120, "Nome muito longo."),
  notes: optionalText(2000, "Observações muito longas."),
  meals: z.array(mealSchema).max(DIET_MEALS_MAX).default([]),
});

export type DietFormInput = z.input<typeof dietFormSchema>;
export type DietFormValues = z.output<typeof dietFormSchema>;

/* -------------------------------------------------------------------------- */
/*  Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** A kcal value rounded for display: "128" or "—". */
export function formatKcal(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return String(Math.round(value)).replace(".", ",");
}

/** A macro value in grams for display: "12,3 g" or "—". */
export function formatGrams(value: number | null): string {
  if (value === null || value === undefined) return "—";
  const n = Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
  return `${n.replace(".", ",")} g`;
}
