// @vitest-environment node
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKOUT_TECHNIQUES } from "@/lib/workout-techniques";
import { STARTER_DIETS } from "@/server/diets/starter-templates";
import { STARTER_WORKOUTS } from "@/server/workouts/starter-templates";
import { EXERCISE_VOCAB, FOOD_VOCAB } from "@/server/starters/vocab";

/**
 * The starter resolution guard. Starters reference the catalog by slug and are
 * resolved against the base catalog at seed time; this test asserts — against the
 * REAL seed artifacts, no database — that every slug resolves, so a typo in a
 * starter or a rename in the catalog fails CI here instead of silently producing
 * an empty diet/workout in a clinic. Mirrors the shortest-match rule in
 * `@/server/starters/resolve`.
 */

function readGzTexts(relPath: string, field: string): string[] {
  return gunzipSync(readFileSync(join(process.cwd(), relPath)))
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .map((r) => r[field] as string)
    .filter((t): t is string => typeof t === "string");
}

const foodTexts = [
  ...readGzTexts("drizzle/data/taco-catalog.ndjson.gz", "description"),
  ...(
    JSON.parse(
      readFileSync(join(process.cwd(), "drizzle/data/taco-supplement.json"), "utf8"),
    ) as { foods: Record<string, unknown>[] }
  ).foods
    .map((r) => (r.description ?? r.name) as string)
    .filter((t): t is string => typeof t === "string"),
];
const exerciseTexts = readGzTexts(
  "drizzle/data/exercises-catalog.ndjson.gz",
  "name",
);

function resolves(pool: string[], pattern: string): boolean {
  const re = new RegExp(pattern, "i");
  return pool.some((t) => re.test(t));
}

describe("starter vocabulary resolves against the base catalog", () => {
  it.each(Object.entries(FOOD_VOCAB))(
    "food slug %s resolves",
    (_slug, pattern) => {
      expect(resolves(foodTexts, pattern)).toBe(true);
    },
  );

  it.each(Object.entries(EXERCISE_VOCAB))(
    "exercise slug %s resolves",
    (_slug, pattern) => {
      expect(resolves(exerciseTexts, pattern)).toBe(true);
    },
  );
});

describe("every starter references only resolvable slugs", () => {
  const usedFood = new Set<string>();
  const usedExercise = new Set<string>();
  for (const diet of STARTER_DIETS) {
    for (const meal of diet.meals) {
      for (const item of meal.items) {
        usedFood.add(item.food);
        for (const sub of item.substitutes ?? []) usedFood.add(sub.food);
      }
    }
  }
  for (const workout of STARTER_WORKOUTS) {
    for (const session of workout.sessions) {
      for (const ex of session.exercises) {
        usedExercise.add(ex.exercise);
        for (const sub of ex.substitutes ?? []) usedExercise.add(sub.exercise);
      }
    }
  }

  it("every used food slug is in the vocabulary", () => {
    for (const slug of usedFood) expect(FOOD_VOCAB).toHaveProperty(slug);
  });

  it("every used exercise slug is in the vocabulary", () => {
    for (const slug of usedExercise) expect(EXERCISE_VOCAB).toHaveProperty(slug);
  });

  it("the starters cover every workout technique", () => {
    const used = new Set<string>();
    for (const workout of STARTER_WORKOUTS) {
      for (const session of workout.sessions) {
        for (const ex of session.exercises) {
          if (ex.technique) used.add(ex.technique);
        }
      }
    }
    for (const technique of WORKOUT_TECHNIQUES) {
      expect(used.has(technique)).toBe(true);
    }
  });

  it("has 13 starter diets and 11 starter workouts", () => {
    expect(STARTER_DIETS.length).toBe(13);
    expect(STARTER_WORKOUTS.length).toBe(11);
  });
});
