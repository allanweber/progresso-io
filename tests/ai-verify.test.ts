import { describe, expect, it } from "vitest";

import type { AiDietGenerateInput } from "@/lib/ai-programs";
import type { FoodCatalogBlock, FoodFacts } from "@/server/ai/catalog";
import type { DietPlan } from "@/server/ai/schemas";
import {
  avoidTerms,
  avoidViolations,
  dietProblems,
  dietTotals,
  isStapleCarb,
  stapleViolations,
} from "@/server/ai/verify";

/**
 * The server-side check on a diet the model wrote.
 *
 * Both rules here come from a real generation that shipped wrong: a 2600 kcal
 * request came back at 2827, and a plan explicitly told to avoid feijão served
 * feijão at lunch. The prompt already said both things — which is why the fix
 * is arithmetic and a word search, not firmer wording.
 */

const facts = (
  description: string,
  kcal: number,
  p: number,
  c: number,
  g: number,
  groupSlug: string | null = null,
): FoodFacts => ({
  id: `id-${description}`,
  description,
  energyKcal: kcal,
  protein: p,
  carbohydrate: c,
  fat: g,
  measureLabel: null,
  measureGrams: null,
  groupSlug,
});

const FOODS = new Map<number, FoodFacts>([
  [1, facts("Arroz, tipo 1, cozido", 128, 2.5, 28.1, 0.2, "cereais-e-derivados")],
  [
    2,
    facts("Feijão, carioca, cozido", 76, 4.8, 13.6, 0.5, "leguminosas-e-derivados"),
  ],
  [
    3,
    facts("Frango, peito, sem pele, grelhado", 159, 32, 0, 2.5, "carnes-e-derivados"),
  ],
  [4, facts("Pão, aveia, forma", 343, 11, 57, 7, "cereais-e-derivados")],
  [5, facts("Aveia, flocos, crua", 394, 13.9, 66.6, 8.5, "cereais-e-derivados")],
  [
    6,
    facts("Batata, doce, cozida", 77, 0.6, 18.4, 0.1, "verduras-hortalicas-e-derivados"),
  ],
  [
    7,
    facts("Brócolis, cru", 25, 3.6, 4.4, 0.3, "verduras-hortalicas-e-derivados"),
  ],
  [8, facts("Banana, nanica, crua", 92, 1.4, 23.8, 0.1, "frutas-e-derivados")],
]);

const catalog = { foods: FOODS } as FoodCatalogBlock;

/** One meal of rice + chicken: 200 g and 200 g. */
const plan = (items: { food: number; grams: number }[]): DietPlan =>
  ({
    name: "Dieta",
    notes: null,
    meals: [{ name: "Almoço", time: "12:30", items }],
  }) as DietPlan;

const meals = (
  named: { name: string; items: { food: number; grams: number }[] }[],
): DietPlan =>
  ({
    name: "Dieta",
    notes: null,
    meals: named.map((m) => ({ name: m.name, time: null, items: m.items })),
  }) as DietPlan;

const input = (over: Partial<AiDietGenerateInput> = {}): AiDietGenerateInput =>
  ({
    objective: "emagrecimento",
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

describe("dietTotals", () => {
  it("sums from the catalog, not from anything the model claimed", () => {
    // 200 g arroz = 256 kcal, 200 g frango = 318 kcal.
    const totals = dietTotals(
      plan([
        { food: 1, grams: 200 },
        { food: 3, grams: 200 },
      ]),
      FOODS,
    );
    expect(Math.round(totals.kcal)).toBe(574);
    expect(Math.round(totals.protein)).toBe(69);
    expect(Math.round(totals.carbs)).toBe(56);
  });

  it("skips an index the catalog does not have", () => {
    // Unknown indices are the hard index check's job; double-reporting them
    // here would bury the real finding under a second one.
    const totals = dietTotals(plan([{ food: 9999, grams: 200 }]), FOODS);
    expect(totals.kcal).toBe(0);
  });
});

describe("avoidTerms", () => {
  it("pulls searchable words out of a sentence", () => {
    // The phrase as the coach wrote it appears in no food description, which
    // is exactly why the match has to be word-level.
    expect(avoidTerms("não come peixe, odeia jiló")).toEqual(["peixe", "jilo"]);
  });

  it("drops accents so the coach's spelling doesn't have to match the catalog", () => {
    expect(avoidTerms("feijão")).toEqual(["feijao"]);
  });

  it("ignores words too short to be an ingredient", () => {
    expect(avoidTerms("sem uva e sem ovo")).toEqual([]);
  });

  it("is empty for a blank field", () => {
    expect(avoidTerms(null)).toEqual([]);
    expect(avoidTerms("")).toEqual([]);
  });
});

describe("avoidViolations", () => {
  it("catches the food the coach asked to keep out", () => {
    // The generation that prompted all of this: "evitar feijão", feijão served.
    expect(
      avoidViolations(
        plan([
          { food: 1, grams: 200 },
          { food: 2, grams: 150 },
        ]),
        FOODS,
        "feijão",
      ),
    ).toEqual(["Feijão, carioca, cozido"]);
  });

  it("says nothing when the plan respected it", () => {
    expect(
      avoidViolations(plan([{ food: 1, grams: 200 }]), FOODS, "feijão"),
    ).toEqual([]);
  });

  it("reports each offending food once, however many meals used it", () => {
    const twice = plan([
      { food: 2, grams: 150 },
      { food: 2, grams: 100 },
    ]);
    expect(avoidViolations(twice, FOODS, "feijão")).toHaveLength(1);
  });
});

describe("isStapleCarb / stapleViolations", () => {
  it("catches two cereals in one meal", () => {
    // The plate the coach objected to: pão de forma next to aveia.
    const found = stapleViolations(
      meals([
        {
          name: "Café da manhã",
          items: [
            { food: 4, grams: 100 },
            { food: 5, grams: 45 },
          ],
        },
      ]),
      FOODS,
    );
    expect(found).toHaveLength(1);
    expect(found[0].foods).toEqual(["Pão, aveia, forma", "Aveia, flocos, crua"]);
  });

  it("leaves arroz com feijão alone", () => {
    // The whole reason this uses TACO groups instead of carb density: feijão is
    // carbohydrate-dense and is also half of the ordinary Brazilian lunch.
    expect(
      stapleViolations(
        meals([
          {
            name: "Almoço",
            items: [
              { food: 1, grams: 200 },
              { food: 2, grams: 150 },
            ],
          },
        ]),
        FOODS,
      ),
    ).toEqual([]);
  });

  it("counts a starchy vegetable but not a leafy one", () => {
    // TACO files potatoes next to broccoli, so the group alone is not enough.
    expect(isStapleCarb(FOODS.get(6)!)).toBe(true);
    expect(isStapleCarb(FOODS.get(7)!)).toBe(false);
  });

  it("does not count fruit as a second starch", () => {
    expect(isStapleCarb(FOODS.get(8)!)).toBe(false);
  });

  it("catches arroz com batata", () => {
    const found = stapleViolations(
      meals([
        {
          name: "Almoço",
          items: [
            { food: 1, grams: 200 },
            { food: 6, grams: 150 },
          ],
        },
      ]),
      FOODS,
    );
    expect(found).toHaveLength(1);
  });

  it("checks each meal on its own", () => {
    // Rice at lunch and bread at breakfast is a normal day, not a violation.
    expect(
      stapleViolations(
        meals([
          { name: "Café", items: [{ food: 4, grams: 50 }] },
          { name: "Almoço", items: [{ food: 1, grams: 200 }] },
        ]),
        FOODS,
      ),
    ).toEqual([]);
  });
});

describe("dietProblems", () => {
  const overTarget = plan([
    { food: 1, grams: 200 },
    { food: 3, grams: 200 },
  ]); // 574 kcal

  it("passes a plan inside the 5% window", () => {
    expect(dietProblems(overTarget, catalog, input({ targetKcal: 570 }))).toEqual(
      [],
    );
  });

  it("reports the real total and the gap, not just 'fora da meta'", () => {
    // "bata a meta" is what the prompt already said and what failed; the number
    // it actually produced is the part the model can act on.
    const [problem] = dietProblems(overTarget, catalog, input({ targetKcal: 400 }));
    expect(problem).toContain("574");
    expect(problem).toContain("400");
    expect(problem).toContain("acima");
  });

  it("says 'abaixo' when the day falls short", () => {
    const [problem] = dietProblems(overTarget, catalog, input({ targetKcal: 900 }));
    expect(problem).toContain("abaixo");
  });

  it("checks each macro independently", () => {
    const problems = dietProblems(
      overTarget,
      catalog,
      input({ targetProteinG: 69, targetCarbsG: 10 }),
    );
    // Protein is on target; carbs are 5× over.
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Carboidrato");
  });

  it("says nothing at all when no target was given", () => {
    expect(dietProblems(overTarget, catalog, input())).toEqual([]);
  });

  it("reports an avoided food alongside a missed target", () => {
    const problems = dietProblems(
      plan([
        { food: 2, grams: 150 },
        { food: 3, grams: 200 },
      ]),
      catalog,
      input({ targetKcal: 200, avoid: "feijão" }),
    );
    expect(problems).toHaveLength(2);
    expect(problems[1]).toContain("Feijão, carioca, cozido");
    expect(problems[1]).toContain("não é negociável");
  });
});
