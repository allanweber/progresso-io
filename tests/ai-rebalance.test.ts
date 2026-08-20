import { describe, expect, it } from "vitest";

import type { AiDietGenerateInput } from "@/lib/ai-programs";
import type { FoodFacts } from "@/server/ai/catalog";
import type { DietPlan } from "@/server/ai/schemas";
import {
  classify,
  macroTargets,
  rebalance,
  totalsOf,
} from "@/server/ai/rebalance";

/**
 * The portions, fitted to the coach's numbers by arithmetic.
 *
 * Every case here is a real generation that shipped wrong: 2600 asked and 2827
 * delivered, then 3214; 2500 low-carb asked and 1832 delivered with 61% of the
 * calories from carbohydrate. Restating the target in the prompt moved those
 * numbers without controlling them, which is what this replaces.
 */

const facts = (
  description: string,
  kcal: number,
  p: number,
  c: number,
  g: number,
  measure?: { label: string; grams: number },
): FoodFacts => ({
  id: `id-${description}`,
  description,
  energyKcal: kcal,
  protein: p,
  carbohydrate: c,
  fat: g,
  measureLabel: measure?.label ?? null,
  measureGrams: measure?.grams ?? null,
  groupSlug: null,
});

const FOODS = new Map<number, FoodFacts>([
  [1, facts("Arroz, tipo 1, cozido", 128, 2.5, 28.1, 0.2)],
  [2, facts("Frango, peito, grelhado", 159, 32, 0, 2.5)],
  [3, facts("Azeite de oliva", 884, 0, 0, 100)],
  [4, facts("Brócolis, cru", 25, 3.6, 4.4, 0.3)],
  [5, facts("Pão, aveia, forma", 343, 11, 57, 7, { label: "fatia", grams: 25 })],
]);

const plan = (items: { food: number; grams: number; measures?: number }[]): DietPlan =>
  ({
    name: "Dieta",
    notes: null,
    meals: [{ name: "Almoço", time: "12:30", items }],
  }) as DietPlan;

const input = (over: Partial<AiDietGenerateInput> = {}): AiDietGenerateInput =>
  ({
    objective: "hipertrofia",
    restrictions: [],
    meals: ["almoco"],
    mealsPerDay: null,
    macroProfiles: [],
    preferences: null,
    avoid: null,
    fromScratch: false,
    targetKcal: null,
    targetProteinG: null,
    targetCarbsG: null,
    targetFatG: null,
    ...over,
  }) as AiDietGenerateInput;

/** A day the model might plausibly write: rice, chicken, oil, broccoli. */
const day = plan([
  { food: 1, grams: 300 },
  { food: 2, grams: 250 },
  { food: 3, grams: 20 },
  { food: 4, grams: 150 },
]);

const share = (t: { kcal: number; carbs: number; protein: number; fat: number }) => ({
  carbs: (t.carbs * 4) / t.kcal,
  protein: (t.protein * 4) / t.kcal,
  fat: (t.fat * 9) / t.kcal,
});

describe("classify", () => {
  it("sorts foods by the macro carrying their calories", () => {
    expect(classify(FOODS.get(1)!)).toBe("carb");
    expect(classify(FOODS.get(2)!)).toBe("protein");
    expect(classify(FOODS.get(3)!)).toBe("fat");
  });

  it("leaves near-zero-calorie foods alone", () => {
    // Scaling broccoli to close a 200 kcal gap produces 900 g of broccoli.
    expect(classify(FOODS.get(4)!)).toBe("free");
  });
});

describe("macroTargets", () => {
  const current = { kcal: 2000, protein: 100, carbs: 250, fat: 60 };

  it("is null when the coach asked for nothing measurable", () => {
    expect(macroTargets(input(), current)).toBeNull();
  });

  it("turns a bare profile into grams against the plan's own calories", () => {
    // "baixo carbo" with no kcal figure is still a complete instruction about
    // the split — there is no reason to make the coach also invent a number.
    const t = macroTargets(input({ macroProfiles: ["baixo_carbo"] }), current)!;
    expect(t.kcal).toBe(2000);
    expect((t.carbs * 4) / t.kcal).toBeCloseTo(0.22, 2);
  });

  it("gives the macros a profile did not mention the rest of the calories", () => {
    const t = macroTargets(input({ macroProfiles: ["baixo_carbo"] }), current)!;
    const s = share(t);
    expect(s.carbs + s.protein + s.fat).toBeCloseTo(1, 2);
    // Protein and fat keep their relative sizes, they just both grow.
    expect(s.protein).toBeGreaterThan(0.25);
  });

  it("combines two profiles", () => {
    const t = macroTargets(
      input({ macroProfiles: ["alta_proteina", "baixo_carbo"] }),
      current,
    )!;
    const s = share(t);
    expect(s.protein).toBeCloseTo(0.32, 2);
    expect(s.carbs).toBeCloseTo(0.22, 2);
  });

  it("lets an explicit gram target override the profile's share", () => {
    const t = macroTargets(
      input({ targetKcal: 2000, macroProfiles: ["baixo_carbo"], targetCarbsG: 300 }),
      current,
    )!;
    expect(t.carbs).toBe(300);
  });
});

describe("rebalance", () => {
  it("does nothing when there is nothing to hit", () => {
    const r = rebalance(day, FOODS, input());
    expect(r.changed).toBe(false);
    expect(r.plan).toBe(day);
  });

  it("brings the calories onto the target", () => {
    // The complaint, exactly: asked 2600, got 2827 — and then 3214.
    const r = rebalance(day, FOODS, input({ targetKcal: 1200 }));
    expect(Math.abs(r.after.kcal - 1200) / 1200).toBeLessThan(0.05);
    expect(r.changed).toBe(true);
  });

  it("scales up as readily as down", () => {
    // The other half of the complaint: 2500 asked, 1832 delivered.
    const before = totalsOf(day, FOODS);
    const r = rebalance(day, FOODS, input({ targetKcal: before.kcal * 1.4 }));
    expect(r.after.kcal).toBeGreaterThan(before.kcal);
    expect(Math.abs(r.after.kcal - before.kcal * 1.4) / (before.kcal * 1.4)).toBeLessThan(
      0.05,
    );
  });

  it("moves the split, not just the total — low carb stays low carb", () => {
    // A single global factor fixes the calories and leaves a low-carb request
    // sitting at the same carbohydrate share it arrived with. This is why the
    // fit is per class.
    const r = rebalance(
      day,
      FOODS,
      input({ targetKcal: 2000, macroProfiles: ["baixo_carbo", "alta_proteina"] }),
    );
    const s = share(r.after);
    expect(s.carbs).toBeLessThan(share(r.before).carbs);
    expect(s.carbs).toBeLessThan(0.32);
    expect(s.protein).toBeGreaterThan(share(r.before).protein);
  });

  it("hits explicit gram targets", () => {
    const r = rebalance(
      day,
      FOODS,
      input({ targetKcal: 1800, targetProteinG: 150, targetCarbsG: 150 }),
    );
    expect(r.after.protein).toBeGreaterThan(130);
    expect(r.after.carbs).toBeLessThan(180);
  });

  it("keeps household portions whole", () => {
    // Three and a half slices of bread is not a prescription anybody follows.
    const withBread = plan([
      { food: 5, grams: 100, measures: 4 },
      { food: 2, grams: 200 },
    ]);
    const r = rebalance(withBread, FOODS, input({ targetKcal: 500 }));
    const bread = r.plan.meals[0].items[0];
    expect(bread.measures).toBe(Math.round(bread.measures!));
    expect(bread.grams).toBe(bread.measures! * 25);
  });

  it("leaves the food selection and the meal order untouched", () => {
    // Only quantities move. Composing the plan is the part the model is good
    // at, and rewriting it here would throw that away.
    const r = rebalance(day, FOODS, input({ targetKcal: 1200 }));
    expect(r.plan.meals.map((m) => m.name)).toEqual(day.meals.map((m) => m.name));
    expect(r.plan.meals[0].items.map((i) => i.food)).toEqual([1, 2, 3, 4]);
  });

  it("does not scale the vegetables", () => {
    const r = rebalance(day, FOODS, input({ targetKcal: 1200 }));
    expect(r.plan.meals[0].items[3].grams).toBe(150);
  });

  it("refuses to distort a plan beyond recognition", () => {
    // A target the plan cannot reach without becoming a different plan is
    // reported by the bounds, not forced: no item more than doubles or halves.
    const r = rebalance(day, FOODS, input({ targetKcal: 200 }));
    for (const [i, item] of r.plan.meals[0].items.entries()) {
      const original = day.meals[0].items[i].grams;
      expect(item.grams).toBeGreaterThanOrEqual(original * 0.5 - 5);
    }
  });

  it("never prescribes a zero or negative portion", () => {
    const r = rebalance(day, FOODS, input({ targetKcal: 300 }));
    for (const item of r.plan.meals[0].items) expect(item.grams).toBeGreaterThan(0);
  });
});
