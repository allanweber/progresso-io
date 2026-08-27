import type { AiDietGenerateInput } from "@/lib/ai-programs";
import type { FoodCatalogBlock, FoodFacts } from "./catalog";
import type { DietPlan } from "./schemas";

/**
 * Server-side checks on a diet the model just wrote.
 *
 * **Why this exists.** The prompt states the targets and the aversions and the
 * model still misses them: a 2600 kcal request came back at 2827, and a plan
 * told to avoid feijão put feijão in the almoço. Both are things the server can
 * check exactly — it has every food's macros and the coach's own words.
 *
 * **Nothing here asks the model again.** These findings used to be sent back as
 * a repair turn; they are not any more, because re-asking was never how they got
 * fixed. The targets are settled by arithmetic in `rebalance`, which runs before
 * this and moves the portions until they close. Aversions are settled *before*
 * the call instead — `forbiddenIndices` names the offending catalog rows by
 * number in the prompt, which is a constraint the model can follow rather than a
 * complaint about an answer it already gave.
 *
 * So what runs here is the **audit of the final plan**: proof, in the log, of
 * what the coach is being handed. A residue — two staples in one meal, a fit
 * that could not close inside its portion bounds — is delivered as a draft and
 * recorded. It is a plate a coach fixes in thirty seconds; a second model call
 * costs another few thousand tokens and only sometimes fixes it.
 */

/** How far off a target may land before the plan is worth flagging. */
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

/**
 * The catalog rows the coach's "Evitar" text rules out, by index.
 *
 * This is the aversion check run **forwards**. `avoidViolations` can only say
 * that an answer broke the rule, which is a fact worth having and a terrible
 * instruction — it arrives one whole call too late. The same word search over
 * the catalog, done before the call, turns "não come peixe" into a list of
 * numbers the model is told not to use. It is the identical predicate, so a plan
 * that respects the list cannot fail the check afterwards.
 *
 * Empty when the coach wrote nothing, or when nothing in the catalog matches —
 * in which case there is no line to add to the prompt and no tokens to spend.
 */
export function forbiddenIndices(
  catalog: FoodCatalogBlock,
  avoid: string | null,
): number[] {
  const terms = avoidTerms(avoid);
  if (terms.length === 0) return [];
  const hits: number[] = [];
  for (const [index, facts] of catalog.foods) {
    const description = fold(facts.description);
    if (terms.some((t) => description.includes(t))) hits.push(index);
  }
  // Ascending, so the prompt line is stable between generations and reads like
  // the catalog it points into.
  return hits.sort((a, b) => a - b);
}

/**
 * Groups whose carbohydrate-dense rows are the meal's *staple* — the rice, the
 * bread, the potato — as opposed to a side or a fruit.
 *
 * `leguminosas-e-derivados` is deliberately absent: feijão is carbohydrate-dense
 * and pairing it with rice is the most ordinary Brazilian lunch there is. So is
 * `frutas-e-derivados` — a banana next to the oats is not a second starch.
 */
const STAPLE_GROUPS = new Set([
  "cereais-e-derivados",
  "alimentos-preparados",
  "miscelaneas",
  // TACO files potatoes and cassava under vegetables, next to broccoli, so this
  // group only counts with the density test below.
  "verduras-hortalicas-e-derivados",
]);

/** Carbohydrate per 100 g above which a vegetable is really a starch. */
const STAPLE_CARB_PER_100G = 15;

/** Whether this food plays the role of the meal's main carbohydrate. */
export function isStapleCarb(f: FoodFacts): boolean {
  if (f.groupSlug === null || !STAPLE_GROUPS.has(f.groupSlug)) return false;
  if (f.groupSlug === "cereais-e-derivados") return true;
  return f.carbohydrate >= STAPLE_CARB_PER_100G;
}

/** Meals carrying more than one staple carbohydrate, with the offending foods. */
export function stapleViolations(
  plan: DietPlan,
  foods: Map<number, FoodFacts>,
): { meal: string; foods: string[] }[] {
  const found: { meal: string; foods: string[] }[] = [];
  for (const meal of plan.meals) {
    const staples = meal.items
      .map((i) => foods.get(i.food))
      .filter((f): f is FoodFacts => f !== undefined && isStapleCarb(f))
      .map((f) => f.description);
    if (staples.length > 1) found.push({ meal: meal.name, foods: staples });
  }
  return found;
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
 * Everything wrong with the final plan that the server can prove, in PT-BR.
 * Empty means it passed.
 *
 * The one-carb-per-meal rule IS checked here, which took a food taxonomy to do
 * safely: the naive "two carbohydrate-dense rows" test flags arroz com feijão,
 * the most ordinary Brazilian lunch there is. TACO's groups separate cereals
 * from legumes and fruit, so the check can catch pão com aveia and leave the
 * feijão alone.
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

  // Pão com aveia, arroz com aveia, arroz com batata: the plate the coach
  // objected to, and one the macros alone will never reveal.
  for (const v of stapleViolations(plan, catalog.foods)) {
    problems.push(
      `${v.meal} tem dois carboidratos principais: ${v.foods.join(" e ")}. ` +
        "Deixe só um e compense a quantidade — a exceção é arroz com leguminosa.",
    );
  }

  const avoided = avoidViolations(plan, catalog.foods, input.avoid);
  if (avoided.length > 0) {
    problems.push(
      `O coach pediu para evitar "${input.avoid}" e a dieta usa: ` +
        `${avoided.join(", ")}. Troque por outro alimento — não é negociável.`,
    );
  }
  return problems;
}
