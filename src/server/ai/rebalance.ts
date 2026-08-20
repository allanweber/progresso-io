import type { AiDietGenerateInput, AiMacroProfile } from "@/lib/ai-programs";
import type { FoodFacts } from "./catalog";
import type { DietPlan } from "./schemas";

/**
 * Makes the numbers true, instead of asking the model to make them true.
 *
 * **Why this is deterministic.** Asking for 2600 kcal produced 2827, then 3214;
 * asking for 2500 low-carb produced 1832 with 61% of the calories from
 * carbohydrate. Restating the target more firmly and re-asking (the repair turn)
 * moved the number without controlling it, because summing twenty foods and
 * solving for portions is arithmetic, and arithmetic is not what a language
 * model is for. The server has every food's macros; it can simply do it.
 *
 * **What it changes and what it does not.** Only the *quantities*. Which foods
 * are in the plan, which meal they sit in and in what order is the model's work
 * and stays untouched — that is the part it is actually good at. So a coach
 * still gets the plan the model composed, with portions that add up.
 *
 * The fit is iterative proportional fitting over four food classes rather than a
 * single global factor: scaling everything by 1.36 fixes the calories and leaves
 * a low-carb request still sitting at 61% carbohydrate. Scaling the carb sources
 * down while scaling the protein sources up is what the request actually meant.
 */

/** What a food mostly *is*, for the purpose of moving one macro without the others. */
export type FoodClass = "protein" | "carb" | "fat" | "free";

/**
 * Below this, a food is a garnish rather than a portion — vegetables and salad.
 * Scaling them chases rounding noise and produces 340 g of tomato.
 */
const FREE_KCAL_PER_100G = 40;

/** Classification by which macro carries the food's calories. */
export function classify(f: FoodFacts): FoodClass {
  if (f.energyKcal < FREE_KCAL_PER_100G) return "free";
  const p = f.protein * 4;
  const c = f.carbohydrate * 4;
  const g = f.fat * 9;
  if (p >= c && p >= g) return "protein";
  if (g >= c) return "fat";
  return "carb";
}

/**
 * Portion bounds, as a multiple of what the model prescribed.
 *
 * A fit with no bounds will happily answer "0.2× the chicken, 3× the rice". The
 * plan has to stay recognisably the plan the model wrote, so a class can be
 * halved or doubled and no more; whatever the fit cannot reach inside those
 * bounds is reported rather than forced.
 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 2;

/** kcal per gram, by macro. */
const KCAL = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * The macro split a profile asks for, as a share of total calories.
 *
 * These are the same numbers the prompt states, kept here so the fit and the
 * instruction cannot drift apart. Unspecified macros take the remainder, split
 * in the default proportion — a coach who says "baixo carbo" and nothing else
 * has expressed an opinion about carbohydrate only.
 */
const DEFAULT_SHARES = { protein: 0.25, carbs: 0.45, fat: 0.3 };

const PROFILE_SHARES: Record<AiMacroProfile, Partial<typeof DEFAULT_SHARES>> = {
  alta_proteina: { protein: 0.32 },
  alto_carbo: { carbs: 0.55 },
  baixo_carbo: { carbs: 0.22 },
  baixa_gordura: { fat: 0.2 },
};

export type MacroTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Totals = MacroTargets;

/** Sums a plan against the catalog. The only totals anything here trusts. */
export function totalsOf(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const f = foods.get(item.food);
      if (!f) continue;
      const r = item.grams / 100;
      t.kcal += f.energyKcal * r;
      t.protein += f.protein * r;
      t.carbs += f.carbohydrate * r;
      t.fat += f.fat * r;
    }
  }
  return t;
}

/**
 * What the day should add up to, from everything the coach said.
 *
 * Gram targets win outright — they are the most specific thing anyone can say.
 * A profile fills in the macros left blank, against the kcal target when there
 * is one and against the plan's own calories when there isn't: "baixo carbo"
 * with no calorie figure is still a complete instruction about the *split*.
 *
 * `null` means the coach asked for nothing measurable and the plan is left
 * exactly as the model wrote it.
 */
export function macroTargets(
  input: AiDietGenerateInput,
  current: Totals,
): MacroTargets | null {
  const hasAny =
    input.targetKcal !== null ||
    input.targetProteinG !== null ||
    input.targetCarbsG !== null ||
    input.targetFatG !== null ||
    input.macroProfiles.length > 0;
  if (!hasAny) return null;

  const kcal = input.targetKcal ?? current.kcal;
  if (kcal <= 0) return null;

  // Profile shares first, then the remainder over whatever they left alone.
  const asked: Partial<typeof DEFAULT_SHARES> = {};
  for (const p of input.macroProfiles) Object.assign(asked, PROFILE_SHARES[p]);

  const keys = ["protein", "carbs", "fat"] as const;
  const fixed = keys.filter((k) => asked[k] !== undefined);
  const free = keys.filter((k) => asked[k] === undefined);
  const usedShare = fixed.reduce((sum, k) => sum + (asked[k] ?? 0), 0);
  const freeDefault = free.reduce((sum, k) => sum + DEFAULT_SHARES[k], 0);
  const shares = { ...DEFAULT_SHARES };
  for (const k of fixed) shares[k] = asked[k]!;
  for (const k of free) {
    // Proportional to the default, so the leftovers keep their relative sizes.
    shares[k] =
      freeDefault > 0 ? (DEFAULT_SHARES[k] / freeDefault) * (1 - usedShare) : 0;
  }

  return {
    kcal,
    // An explicit gram target overrides the share it was derived from.
    protein: input.targetProteinG ?? (kcal * shares.protein) / KCAL.protein,
    carbs: input.targetCarbsG ?? (kcal * shares.carbs) / KCAL.carbs,
    fat: input.targetFatG ?? (kcal * shares.fat) / KCAL.fat,
  };
}

const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

/**
 * Per-class scale factors that bring the plan's macros to the targets.
 *
 * Iterative proportional fitting: each pass corrects one macro by moving the
 * class that carries it, then re-measures. Every food contributes to all three
 * macros (chicken carries fat, oats carry protein), so the passes interact —
 * which is exactly why this iterates rather than solving each in isolation.
 * Six passes is well past where it stops moving for real diets.
 */
export function fitScales(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
  targets: MacroTargets,
): Record<FoodClass, number> {
  const scales: Record<FoodClass, number> = {
    protein: 1,
    carb: 1,
    fat: 1,
    // Vegetables stay exactly as prescribed.
    free: 1,
  };

  /** Grams of `macro` contributed by each class at the current scales. */
  const contribution = (macro: "protein" | "carbs" | "fat") => {
    const by: Record<FoodClass, number> = { protein: 0, carb: 0, fat: 0, free: 0 };
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        const f = foods.get(item.food);
        if (!f) continue;
        const cls = classify(f);
        const per =
          macro === "protein"
            ? f.protein
            : macro === "carbs"
              ? f.carbohydrate
              : f.fat;
        by[cls] += (per * item.grams * scales[cls]) / 100;
      }
    }
    return by;
  };

  const pairs = [
    ["protein", "protein"],
    ["carbs", "carb"],
    ["fat", "fat"],
  ] as const;

  for (let pass = 0; pass < 6; pass++) {
    for (const [macro, cls] of pairs) {
      const by = contribution(macro);
      const own = by[cls];
      // Everything this class does not control, and therefore cannot fix.
      const rest = by.protein + by.carb + by.fat + by.free - own;
      if (own <= 0) continue;
      const wanted = targets[macro] - rest;
      // The other classes alone already overshoot: shrink to the floor and let
      // the next pass pull them down instead.
      scales[cls] = clamp(scales[cls] * Math.max(0.01, wanted / own));
    }
  }
  return scales;
}

/** One item's quantity after scaling, snapped to something a person can serve. */
function snap(
  grams: number,
  facts: FoodFacts | undefined,
  measures: number | null | undefined,
): { grams: number; measures: number | null } {
  // A household portion is counted, not weighed: three and a half slices of
  // bread is not a prescription anybody follows.
  if (
    measures != null &&
    facts?.measureGrams != null &&
    facts.measureGrams > 0
  ) {
    const count = Math.max(1, Math.round(grams / facts.measureGrams));
    return { grams: count * facts.measureGrams, measures: count };
  }
  // Otherwise the nearest 5 g, which is what a kitchen scale reads anyway.
  return { grams: Math.max(5, Math.round(grams / 5) * 5), measures: null };
}

export type RebalanceResult = {
  plan: DietPlan;
  /** Whether any quantity actually moved. */
  changed: boolean;
  before: Totals;
  after: Totals;
  targets: MacroTargets | null;
};

/**
 * The plan with its portions fitted to the coach's numbers.
 *
 * Runs after the model has had its say — including its free repair turn — so
 * what it fits is the best answer the model produced, not the first one.
 */
export function rebalance(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
  input: AiDietGenerateInput,
): RebalanceResult {
  const before = totalsOf(plan, foods);
  const targets = macroTargets(input, before);
  if (targets === null) {
    return { plan, changed: false, before, after: before, targets: null };
  }

  const scales = fitScales(plan, foods, targets);
  let changed = false;
  const scaled: DietPlan = {
    ...plan,
    meals: plan.meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => {
        const f = foods.get(item.food);
        if (!f) return item;
        const next = snap(item.grams * scales[classify(f)], f, item.measures);
        if (next.grams !== item.grams) changed = true;
        return { ...item, grams: next.grams, measures: next.measures };
      }),
    })),
  };

  // Rounding leaves a few percent on the table. One uniform correction over the
  // gram-priced items closes it without disturbing the whole-unit portions,
  // which are the ones a person actually counts.
  const afterSnap = totalsOf(scaled, foods);
  const correction = afterSnap.kcal > 0 ? targets.kcal / afterSnap.kcal : 1;
  if (Math.abs(correction - 1) > 0.02) {
    scaled.meals = scaled.meals.map((meal, mi) => ({
      ...meal,
      items: meal.items.map((item, ii) => {
        const f = foods.get(item.food);
        if (!f || item.measures != null || classify(f) === "free") return item;
        // Bounded against the ORIGINAL portion, not against the already-scaled
        // one. Two passes each allowed to halve a portion quietly compose into
        // a quarter of it, which is how a 300 g plate of rice became 75 g.
        const origin = plan.meals[mi].items[ii].grams;
        const bounded = Math.min(
          origin * MAX_SCALE,
          Math.max(origin * MIN_SCALE, item.grams * correction),
        );
        const next = snap(bounded, f, null);
        if (next.grams !== item.grams) changed = true;
        return { ...item, grams: next.grams };
      }),
    }));
  }

  return {
    plan: scaled,
    changed,
    before,
    after: totalsOf(scaled, foods),
    targets,
  };
}
