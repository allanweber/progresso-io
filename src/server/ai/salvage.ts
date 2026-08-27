import type { CatalogBlock } from "./catalog";
import type { DietPlan, WorkoutPlan } from "./schemas";

/**
 * Recovering a usable plan from an answer that referenced catalog rows which do
 * not exist — **without asking the model again**.
 *
 * A hallucinated index is the one failure the prompt cannot fully prevent: the
 * rule is stated twice, the catalog is a numbered list, and a cheap model still
 * occasionally writes a number that is not in it. The old answer was a second
 * round-trip — restate the rule, name the offending numbers, ask again. That is
 * a whole extra call to fix one bad line out of forty, and it doubles the
 * latency of the *entire* generation for every coach it happens to.
 *
 * So the bad line is dropped and the rest of the plan stands. For a dieta the
 * hole then closes by itself: `rebalance` re-fits the remaining portions to the
 * coach's targets, so a day that lost one item still lands on its kcal and
 * macros. Nothing here invents a replacement — a food the model never chose is
 * not a food the coach asked for.
 *
 * **When there is nothing left worth delivering, this fails instead.** A plan
 * salvaged down to one meal is not a plan; it is a mess the coach has to rebuild
 * from scratch, and handing it over as a draft would be worse than the honest
 * failure that refunds the credit.
 */

/**
 * The floor for a salvaged dieta. Two meals is already thin, but it is a day a
 * coach can extend; one is a snack.
 */
const MIN_MEALS = 2;

export type Salvage<T> =
  | { ok: true; plan: T; dropped: number[] }
  | { ok: false; dropped: number[] };

/** Drops diet items whose food index is not in the catalog, plus emptied meals. */
export function dropUnknownFoods(
  plan: DietPlan,
  catalog: CatalogBlock,
): Salvage<DietPlan> {
  const dropped: number[] = [];
  const meals = plan.meals
    .map((meal) => ({
      ...meal,
      items: meal.items.filter((item) => {
        if (catalog.byIndex.has(item.food)) return true;
        dropped.push(item.food);
        return false;
      }),
    }))
    // A meal with no food left is not a meal the coach can read, and leaving it
    // in the draft as an empty heading only invites confusion.
    .filter((meal) => meal.items.length > 0);

  if (dropped.length === 0) return { ok: true, plan, dropped };
  if (meals.length < MIN_MEALS) return { ok: false, dropped };
  return { ok: true, plan: { ...plan, meals }, dropped };
}

/** Drops workout exercises whose index is not in the catalog, plus emptied sessions. */
export function dropUnknownExercises(
  plan: WorkoutPlan,
  catalog: CatalogBlock,
): Salvage<WorkoutPlan> {
  const dropped: number[] = [];
  const sessions = plan.sessions
    .map((session) => ({
      ...session,
      exercises: session.exercises.filter((exercise) => {
        if (catalog.byIndex.has(exercise.exercise)) return true;
        dropped.push(exercise.exercise);
        return false;
      }),
    }))
    .filter((session) => session.exercises.length > 0);

  if (dropped.length === 0) return { ok: true, plan, dropped };
  // Unlike a dieta, one session IS a usable treino — a coach can run an A-only
  // week — so the floor here is "anything at all left".
  if (sessions.length === 0) return { ok: false, dropped };
  return { ok: true, plan: { ...plan, sessions }, dropped };
}
