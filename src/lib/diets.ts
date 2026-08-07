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
 */
export const MEAL_SUGGESTIONS = [
  "Café da manhã",
  "Lanche da manhã",
  "Almoço",
  "Lanche da tarde",
  "Jantar",
  "Ceia",
  "Pré-treino",
] as const;

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
  substitutes: DietItemSubstituteDto[];
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

const mealSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da refeição.")
    .max(80, "Nome muito longo."),
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
  meals: z.array(mealSchema).max(30).default([]),
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
