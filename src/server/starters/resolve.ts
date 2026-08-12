import { and, eq, isNull } from "drizzle-orm";

import { type Database, schema } from "@/db";
import type { DietWriteInput } from "@/server/dal/diets";
import type { WorkoutWriteInput } from "@/server/dal/workouts";
import type { StarterDiet } from "@/server/diets/starter-templates";
import type { StarterWorkout } from "@/server/workouts/starter-templates";
import {
  EXERCISE_VOCAB,
  FOOD_VOCAB,
  type ExerciseSlug,
  type FoodSlug,
} from "./vocab";

/**
 * Turns starter templates (which reference catalog items by slug) into DAL write
 * inputs (which reference them by UUID), by resolving each slug against the
 * **base** catalog. A `food`/`exercise` id is generated per database, so starters
 * can't embed ids — they carry slugs, and this resolves them at seed/import time
 * exactly like the dev seed's ILIKE lookups (shortest matching row wins).
 *
 * The base catalog is loaded ONCE per resolver, so seeding all 24 starters into a
 * clinic costs two catalog queries, not two per template.
 */

type CatalogRow = { id: string; text: string };

/** Picks the shortest catalog row whose text matches `pattern` (case-insensitive). */
function pick(rows: CatalogRow[], pattern: string): string | null {
  const re = new RegExp(pattern, "i");
  let best: CatalogRow | null = null;
  for (const row of rows) {
    if (!re.test(row.text)) continue;
    if (
      !best ||
      row.text.length < best.text.length ||
      (row.text.length === best.text.length && row.text < best.text)
    ) {
      best = row;
    }
  }
  return best?.id ?? null;
}

export type StarterResolver = {
  /** Base-food id for a slug, or null when nothing in the catalog matches. */
  food: (slug: FoodSlug) => string | null;
  /** Base-exercise id for a slug, or null when nothing matches. */
  exercise: (slug: ExerciseSlug) => string | null;
};

/** Loads the base catalog once and returns memoized slug→id resolvers. */
export async function loadStarterResolver(db: Database): Promise<StarterResolver> {
  const [foods, exercises] = await Promise.all([
    db
      .select({ id: schema.food.id, text: schema.food.description })
      .from(schema.food)
      .where(and(isNull(schema.food.clinicId), eq(schema.food.archived, false))),
    db
      .select({ id: schema.exercise.id, text: schema.exercise.name })
      .from(schema.exercise)
      .where(
        and(isNull(schema.exercise.clinicId), eq(schema.exercise.archived, false)),
      ),
  ]);

  const foodCache = new Map<string, string | null>();
  const exCache = new Map<string, string | null>();

  return {
    food(slug) {
      if (!foodCache.has(slug)) foodCache.set(slug, pick(foods, FOOD_VOCAB[slug]));
      return foodCache.get(slug) ?? null;
    },
    exercise(slug) {
      if (!exCache.has(slug))
        exCache.set(slug, pick(exercises, EXERCISE_VOCAB[slug]));
      return exCache.get(slug) ?? null;
    },
  };
}

/**
 * Builds a diet write input from a starter, resolving every food slug. An item
 * whose food doesn't resolve (missing from the catalog) is dropped, a meal left
 * with no items is dropped, and a starter left with no meals returns null (skip).
 * In practice the resolution guard test keeps every slug resolvable, so nothing
 * is dropped — this is defence against a catalog change.
 */
export function buildDietInput(
  starter: StarterDiet,
  r: StarterResolver,
): DietWriteInput | null {
  const meals = starter.meals
    .map((meal) => ({
      name: meal.name,
      time: meal.time,
      items: meal.items.flatMap((item) => {
        const foodId = r.food(item.food);
        if (!foodId) return [];
        const substitutes = (item.substitutes ?? []).flatMap((sub) => {
          const id = r.food(sub.food);
          return id ? [{ foodId: id, grams: sub.grams }] : [];
        });
        return [
          {
            foodId,
            grams: item.grams,
            measureLabel: item.measure?.label ?? null,
            measureGrams: item.measure?.grams ?? null,
            substitutes,
          },
        ];
      }),
    }))
    .filter((meal) => meal.items.length > 0);

  if (meals.length === 0) return null;
  return { name: starter.name, notes: starter.notes, meals };
}

/** Builds a workout write input from a starter, resolving every exercise slug. */
export function buildWorkoutInput(
  starter: StarterWorkout,
  r: StarterResolver,
): WorkoutWriteInput | null {
  const sessions = starter.sessions
    .map((session) => ({
      name: session.name,
      exercises: session.exercises.flatMap((exercise) => {
        const exerciseId = r.exercise(exercise.exercise);
        if (!exerciseId) return [];
        const customSubstitutes = (exercise.substitutes ?? []).flatMap((sub) => {
          const id = r.exercise(sub.exercise);
          return id ? [{ exerciseId: id, note: sub.note ?? null }] : [];
        });
        return [
          {
            exerciseId,
            sets: exercise.sets,
            reps: exercise.reps,
            load: exercise.load ?? null,
            rest: exercise.rest ?? 90,
            note: exercise.note ?? null,
            technique: exercise.technique ?? null,
            groupId: exercise.groupId ?? null,
            customSubstitutes,
          },
        ];
      }),
    }))
    .filter((session) => session.exercises.length > 0);

  if (sessions.length === 0) return null;
  return { name: starter.name, notes: starter.notes, sessions };
}
