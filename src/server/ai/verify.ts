import type { AiDietGenerateInput } from "@/lib/ai-programs";
import type { FoodCatalogBlock, FoodFacts } from "./catalog";
import type { DietPlan } from "./schemas";

/**
 * Server-side checks on a diet the model just wrote.
 *
 * **Why this exists.** The prompt already states the targets and the aversions,
 * and the model still misses them: a 2600 kcal request came back at 2827, and a
 * plan told to avoid feijão put feijão in the almoço. Both are things the server
 * can check exactly — it has every food's macros and the coach's own words — so
 * checking beats asking more firmly. The findings go back as the **repair turn**
 * that already exists for hallucinated catalog indices, which costs tokens and
 * not a credit.
 *
 * **These are soft.** Unlike an invalid index — which cannot be persisted at all
 * — a plan that is 8% over on calories is a real plan a coach can fix in thirty
 * seconds. So a surviving violation is delivered as a draft, not thrown away:
 * the credit was already spent, and handing back nothing would be the worse of
 * the two outcomes.
 */

/** How far off a target may land before it is worth a repair turn. */
export const TARGET_TOLERANCE = 0.05;

/** The day's totals, summed from the catalog rather than from the model. */
export function dietTotals(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
): { kcal: number; protein: number; carbs: number; fat: number } {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const f = foods.get(item.food);
      // An unknown index is the index check's problem, not this one.
      if (!f) continue;
      const ratio = item.grams / 100;
      kcal += f.energyKcal * ratio;
      protein += f.protein * ratio;
      carbs += f.carbohydrate * ratio;
      fat += f.fat * ratio;
    }
  }
  return { kcal, protein, carbs, fat };
}

/**
 * Strips accents and lowercases, so "feijão" written by the coach matches
 * "Feijao" however the catalog spells it.
 */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Words in "Evitar" that are about the aluno, not about food. Without them
 * "não come peixe" contributes "come", which matches nothing but is noise, and
 * a longer stopword list is not worth the risk of dropping a real ingredient.
 */
const AVOID_STOPWORDS = new Set([
  "come",
  "gosta",
  "odeia",
  "detesta",
  "evitar",
  "evita",
  "nunca",
  "nada",
  "pouco",
  "muito",
  "alimentos",
  "alimento",
  "comida",
  "comidas",
]);

/**
 * The coach's free-text aversions, as words worth searching the catalog for.
 *
 * Free text is what makes this field useful — no checkbox list will ever carry
 * "odeia jiló" — and it is also why the match has to be word-level: the phrase
 * as written appears in no food description. Four characters is the floor
 * because below it the matches are prepositions ("de", "com", "sem").
 */
export function avoidTerms(avoid: string | null): string[] {
  if (!avoid) return [];
  const words = fold(avoid)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !AVOID_STOPWORDS.has(w));
  return [...new Set(words)];
}

/** Foods in the plan whose description contains one of the avoided words. */
export function avoidViolations(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
  avoid: string | null,
): string[] {
  const terms = avoidTerms(avoid);
  if (terms.length === 0) return [];
  const hits = new Set<string>();
  for (const meal of plan.meals) {
    for (const item of meal.items) {
      const f = foods.get(item.food);
      if (!f) continue;
      const description = fold(f.description);
      if (terms.some((t) => description.includes(t))) hits.add(f.description);
    }
  }
  return [...hits];
}

/** "2827 kcal (pedido: 2600, fora da margem de 5%)" */
function targetLine(
  label: string,
  actual: number,
  target: number,
  unit: string,
): string | null {
  const off = Math.abs(actual - target) / target;
  if (off <= TARGET_TOLERANCE) return null;
  const direction = actual > target ? "acima" : "abaixo";
  return (
    `${label}: a dieta soma ${Math.round(actual)} ${unit} e a meta é ` +
    `${target} ${unit} — ${Math.round(off * 100)}% ${direction} do pedido. ` +
    "Ajuste as quantidades até fechar."
  );
}

/**
 * Everything wrong with this plan that the server can prove, in PT-BR, ready to
 * paste into the repair turn. Empty means the plan passed.
 *
 * Deliberately **not** checking the one-carb-per-meal rule: arroz com feijão is
 * two carbohydrate-dense rows and is also the most ordinary Brazilian lunch
 * there is. A checker cannot tell that pairing from pão com aveia without a
 * food taxonomy the catalog does not carry, and a false positive here would
 * burn a repair turn to "fix" a correct plan. That rule stays in the prompt.
 */
export function dietProblems(
  plan: DietPlan,
  catalog: FoodCatalogBlock,
  input: AiDietGenerateInput,
): string[] {
  const totals = dietTotals(plan, catalog.foods);
  const problems = [
    input.targetKcal !== null
      ? targetLine("Calorias", totals.kcal, input.targetKcal, "kcal")
      : null,
    input.targetProteinG !== null
      ? targetLine("Proteína", totals.protein, input.targetProteinG, "g")
      : null,
    input.targetCarbsG !== null
      ? targetLine("Carboidrato", totals.carbs, input.targetCarbsG, "g")
      : null,
    input.targetFatG !== null
      ? targetLine("Gordura", totals.fat, input.targetFatG, "g")
      : null,
  ].filter((p): p is string => p !== null);

  const avoided = avoidViolations(plan, catalog.foods, input.avoid);
  if (avoided.length > 0) {
    problems.push(
      `O coach pediu para evitar "${input.avoid}" e a dieta usa: ` +
        `${avoided.join(", ")}. Troque por outro alimento — não é negociável.`,
    );
  }
  return problems;
}
