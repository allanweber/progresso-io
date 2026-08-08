import { z } from "@/lib/validation";
import {
  type DietDetailDto,
  type DietMacrosDto,
  type DietMealDto,
  type DietOrigin,
} from "@/lib/diets";

/**
 * Client-safe domain for a student's diet (dieta do aluno). Unlike the reusable
 * template `diet`, a student's diet is **versioned and snapshotted**: each
 * published version stores the whole meal tree as a self-contained JSON document
 * (`DietTree`) with the food description + per-100 g macros embedded and the
 * kcal/macros already computed. So a published version never changes when a base
 * food is later edited or archived — the history is immutable.
 *
 * The tree is always built on the **server** from the food catalog (see the DAL),
 * never trusted from the client: the client sends the same `foodId`+`grams`
 * payload the template builder emits, and the DAL embeds the snapshot.
 */

/* -------------------------------------------------------------------------- */
/*  Stored JSON tree (embedded snapshot + computed macros)                     */
/* -------------------------------------------------------------------------- */

/** Macros of a food line or a summed total (any field null if unmeasured). */
export type TreeMacros = DietMacrosDto;

/** A food line inside the tree — the food is embedded, macros pre-computed. */
export type TreeFoodLine = {
  foodId: string;
  description: string;
  code: string | null;
  origin: DietOrigin;
  grams: number;
  /** How the quantity was entered (medida caseira), or null for plain grams. */
  measureLabel: string | null;
  /** Grams of one of that measure (so a count = grams / measureGrams). */
  measureGrams: number | null;
  /** The food's macros per 100 g (kept so the builder can rescale on edit). */
  per100: TreeMacros;
  /** The macros already scaled to `grams` (what the read view displays). */
  macros: TreeMacros;
};

/** A meal item: a food line plus its coach-defined equivalences. */
export type TreeItem = TreeFoodLine & { substitutes: TreeFoodLine[] };

/** A meal within the tree, with its summed totals. */
export type TreeMeal = {
  name: string;
  time: string | null;
  totals: TreeMacros;
  items: TreeItem[];
};

/** The whole meal tree of one diet version, self-contained. */
export type DietTree = {
  totals: TreeMacros;
  meals: TreeMeal[];
};

/** An empty tree (a brand-new blank draft). */
export const EMPTY_TREE: DietTree = {
  totals: { energyKcal: null, protein: null, carbohydrate: null, fat: null },
  meals: [],
};

/* -------------------------------------------------------------------------- */
/*  Read DTOs                                                                  */
/* -------------------------------------------------------------------------- */

/** The draft (unpublished) version currently in flight, if any. */
export type StudentDietDraftDto = {
  dietId: string;
  dietName: string;
  versionId: string;
  /**
   * true when this draft is a **new** diet's first version — publishing it
   * archives the student's previous active diet. false when it's a new version
   * of the already-active diet.
   */
  isNewDiet: boolean;
  notes: string | null;
  tree: DietTree;
};

/** The published version the aluno currently sees (latest of the active diet). */
export type StudentDietPublishedDto = {
  dietId: string;
  dietName: string;
  version: number;
  /** ISO timestamp. */
  publishedAt: string;
  notes: string | null;
  tree: DietTree;
};

/** One published version in a diet's history. */
export type StudentDietHistoryVersionDto = {
  versionId: string;
  version: number;
  /** ISO timestamp. */
  publishedAt: string;
};

/** A diet (active or archived) with its published versions, for the history. */
export type StudentDietHistoryDto = {
  dietId: string;
  dietName: string;
  status: "active" | "archived";
  versions: StudentDietHistoryVersionDto[];
};

/**
 * Everything the Dieta tab needs to render its state machine in one read:
 * the aluno-visible current version, the in-flight draft (if any), and the
 * full history. The tab picks its state as: draft → builder; else current →
 * read view; else → empty state.
 */
export type StudentDietStateDto = {
  activeDietId: string | null;
  current: StudentDietPublishedDto | null;
  draft: StudentDietDraftDto | null;
  history: StudentDietHistoryDto[];
};

/** A single version's tree, for the read-only history view. */
export type StudentDietVersionDto = {
  dietId: string;
  dietName: string;
  version: number;
  publishedAt: string;
  notes: string | null;
  tree: DietTree;
};

/* -------------------------------------------------------------------------- */
/*  Input schemas (zod — validated at the API before the DAL)                  */
/* -------------------------------------------------------------------------- */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome da dieta.")
  .max(120, "Nome muito longo.");

/**
 * Starting a draft for the student — one of three kinds:
 * - `blank`    — a brand-new empty diet (the coach names it);
 * - `template` — copy one of the coach's template diets (optional new name);
 * - `edit`     — open a draft of the already-active diet (new version).
 */
export const studentDietCreateActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank"), name: nameSchema }),
  z.object({
    kind: z.literal("template"),
    dietId: z.string().uuid("Dieta inválida."),
    name: nameSchema.optional(),
  }),
  z.object({ kind: z.literal("edit") }),
]);
export type StudentDietCreateAction = z.infer<
  typeof studentDietCreateActionSchema
>;

/** Exporting a student's diet version to the clinic's template catalog. */
export const saveAsTemplateSchema = z.object({
  versionId: z.string().uuid("Versão inválida.").optional(),
});

/* -------------------------------------------------------------------------- */
/*  Pure tree → view mappers (client + server safe)                            */
/* -------------------------------------------------------------------------- */

/**
 * Maps a stored `DietTree` to the `DietMealDto[]` the read-only `DietMealsView`
 * already renders. Ids are synthesized from indices (the tree has no row ids),
 * and `foodSubstitutes` (live catalog swaps) is empty — a snapshot only shows
 * what was frozen into it.
 */
export function treeToMealDtos(tree: DietTree): DietMealDto[] {
  return tree.meals.map((meal, mi) => ({
    id: `m${mi}`,
    name: meal.name,
    time: meal.time,
    position: mi,
    totals: meal.totals,
    items: meal.items.map((it, ii) => ({
      id: `m${mi}i${ii}`,
      foodId: it.foodId,
      description: it.description,
      code: it.code,
      origin: it.origin,
      grams: it.grams,
      measureLabel: it.measureLabel,
      measureGrams: it.measureGrams,
      macros: it.macros,
      substitutes: it.substitutes.map((s, si) => ({
        id: `m${mi}i${ii}s${si}`,
        foodId: s.foodId,
        description: s.description,
        code: s.code,
        origin: s.origin,
        grams: s.grams,
        measureLabel: s.measureLabel,
        measureGrams: s.measureGrams,
        macros: s.macros,
      })),
      foodSubstitutes: [],
    })),
  }));
}

/**
 * Maps a stored `DietTree` (+ name/notes) to the `DietDetailDto` the reusable
 * `DietBuilder` consumes as its initial data. `origin` is always "clinic" so the
 * builder treats it as editable.
 */
export function treeToDietDetail(
  dietId: string,
  name: string,
  notes: string | null,
  tree: DietTree,
): DietDetailDto {
  return {
    id: dietId,
    name,
    notes,
    origin: "clinic",
    archived: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    meals: treeToMealDtos(tree),
    totals: tree.totals,
  };
}
