import { describe, expect, it } from "vitest";

import {
  dropUnknownExercises,
  dropUnknownFoods,
} from "@/server/ai/salvage";
import type { CatalogBlock } from "@/server/ai/catalog";
import type { DietPlan, WorkoutPlan } from "@/server/ai/schemas";

/**
 * Recovering from a hallucinated catalog number **without a second model call**.
 *
 * The rule being pinned down: one invented row costs that row, not the coach's
 * generation and not another round-trip. The judgement call inside is where to
 * stop — a plan salvaged down to nothing is a mess the coach has to rebuild, and
 * failing honestly (which refunds the credit) beats handing that over.
 */

/** A catalog knowing indices 1..3 — everything else is invented. */
const catalog: CatalogBlock = {
  text: "",
  hash: "",
  size: 3,
  byIndex: new Map([
    [1, "id-1"],
    [2, "id-2"],
    [3, "id-3"],
  ]),
};

const item = (food: number) => ({
  food,
  grams: 100,
  measures: null,
  note: null,
});

const diet = (meals: number[][]): DietPlan =>
  ({
    name: "Dieta",
    notes: null,
    meals: meals.map((foods, i) => ({
      name: `Refeição ${i + 1}`,
      time: null,
      items: foods.map(item),
    })),
  }) as DietPlan;

const exercise = (index: number) => ({
  exercise: index,
  sets: 3,
  reps: [10],
  rest: 60,
  note: null,
});

const workout = (sessions: number[][]): WorkoutPlan =>
  ({
    name: "Treino",
    notes: null,
    sessions: sessions.map((exercises, i) => ({
      name: `Ficha ${String.fromCharCode(65 + i)}`,
      exercises: exercises.map(exercise),
    })),
  }) as WorkoutPlan;

describe("dropUnknownFoods", () => {
  it("leaves a clean plan untouched", () => {
    const plan = diet([[1, 2], [3]]);
    const result = dropUnknownFoods(plan, catalog);
    expect(result).toEqual({ ok: true, plan, dropped: [] });
    // The same object, not a copy: nothing was rebuilt for nothing.
    if (result.ok) expect(result.plan).toBe(plan);
  });

  it("drops the invented food and keeps the meal", () => {
    const result = dropUnknownFoods(diet([[1, 999], [2, 3]]), catalog);
    expect(result.dropped).toEqual([999]);
    if (!result.ok) throw new Error("should have salvaged");
    expect(result.plan.meals[0].items.map((i) => i.food)).toEqual([1]);
    expect(result.plan.meals[1].items.map((i) => i.food)).toEqual([2, 3]);
  });

  it("drops a meal left with nothing in it", () => {
    const result = dropUnknownFoods(diet([[1], [999], [2]]), catalog);
    if (!result.ok) throw new Error("should have salvaged");
    // An empty heading in the draft reads as a bug, not as a meal.
    expect(result.plan.meals).toHaveLength(2);
    expect(result.plan.meals.map((m) => m.name)).toEqual([
      "Refeição 1",
      "Refeição 3",
    ]);
  });

  it("refuses to deliver a day salvaged down to a single meal", () => {
    const result = dropUnknownFoods(diet([[1], [998], [999]]), catalog);
    expect(result.ok).toBe(false);
    expect(result.dropped).toEqual([998, 999]);
  });

  it("reports every invented number, not just the first", () => {
    const result = dropUnknownFoods(diet([[1, 500], [2, 600], [3]]), catalog);
    expect(result.dropped).toEqual([500, 600]);
  });
});

describe("dropUnknownExercises", () => {
  it("leaves a clean plan untouched", () => {
    const plan = workout([[1, 2], [3]]);
    expect(dropUnknownExercises(plan, catalog)).toEqual({
      ok: true,
      plan,
      dropped: [],
    });
  });

  it("drops the invented exercise and keeps the session", () => {
    const result = dropUnknownExercises(workout([[1, 999, 2]]), catalog);
    if (!result.ok) throw new Error("should have salvaged");
    expect(result.plan.sessions[0].exercises.map((e) => e.exercise)).toEqual([
      1, 2,
    ]);
  });

  it("keeps a single surviving session — one ficha is a usable treino", () => {
    const result = dropUnknownExercises(workout([[1], [999]]), catalog);
    if (!result.ok) throw new Error("should have salvaged");
    expect(result.plan.sessions).toHaveLength(1);
  });

  it("fails when nothing at all survives", () => {
    const result = dropUnknownExercises(workout([[998], [999]]), catalog);
    expect(result.ok).toBe(false);
  });
});
