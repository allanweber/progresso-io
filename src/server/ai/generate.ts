import type { AiGenerationKind } from "@/db/schema";
import type {
  AiDietGenerateInput,
  AiWorkoutGenerateInput,
} from "@/lib/ai-programs";
import {
  getLlmProvider,
  isLlmConfigured,
  type LlmCall,
  type LlmProvider,
  type LlmUsage,
} from "@/lib/llm-provider";
import type { DietWriteInput } from "@/server/dal/diets";
import type { WorkoutWriteInput } from "@/server/dal/workouts";
import {
  ai,
  aiSettings,
  plans,
  studentAnamneses,
  studentDiets,
  students,
  studentWorkouts,
} from "@/server/dal";
import { logger } from "@/server/observability";
import { bodyWeightKg } from "@/lib/student-anamneses";
import type { TenantContext } from "@/server/tenant";
import {
  buildExerciseCatalog,
  buildFoodCatalog,
  resolveIndices,
  type CatalogBlock,
} from "./catalog";
import {
  dietSystemPrompt,
  renderDietBaseline,
  userPrompt,
  workoutSystemPrompt,
} from "./prompts";
import {
  DIET_JSON_SCHEMA,
  dietIndices,
  dietPlanSchema,
  WORKOUT_JSON_SCHEMA,
  workoutIndices,
  workoutPlanSchema,
  type DietPlan,
  type WorkoutPlan,
} from "./schemas";
import { rebalance } from "./rebalance";
import { dropUnknownExercises, dropUnknownFoods } from "./salvage";
import { dietProblems, forbiddenIndices } from "./verify";

/**
 * The generation service: quota → model → salvage → fit → draft.
 *
 * Everything here is orchestration; the interesting invariants live in the
 * pieces it calls. Two are worth restating because they are easy to break:
 *
 * - **The audit row is written before the model call and settled after.** That
 *   two-phase shape is what makes a failure free while still stopping two
 *   concurrent requests from sharing one credit. Every exit path below must
 *   settle the row — an abandoned `pending` silently costs the coach a credit.
 * - **Exactly one model call per generation.** Whatever comes back is what the
 *   coach gets: what the server can prove, it fixes itself (`salvage` drops an
 *   invented catalog row, `rebalance` fits the portions to the targets); what it
 *   cannot fix, it logs and delivers as a draft. Re-asking is never the answer —
 *   it doubles the latency and the tokens to redo work the server does for
 *   certain. The requirements have to be met on the first call, which is why
 *   the coach's aversions reach the prompt as forbidden catalog numbers rather
 *   than as prose to interpret.
 */

export type GenerateRefusal =
  | "not_configured"
  | "no_anamnesis"
  | "quota_exceeded"
  | "already_running"
  | "not_found";

export type GenerateResult =
  | { ok: true; used: number; limit: number | null; repaired: boolean }
  | { ok: false; refusal: GenerateRefusal }
  | { ok: false; failed: true; message: string };

/**
 * The starting total for a generation: nothing spent, cost **unknown**.
 *
 * The asymmetry is deliberate and load-bearing. The token counters start at 0
 * because a call that reports no tokens genuinely consumed none we can see. Cost
 * starts at `null` because a provider that reports no cost has told us nothing —
 * and 0 is a real, different claim ("this model is free") that makes the ledger
 * skip the `provider_price` estimate entirely. Seeding it at 0 would silently
 * zero the whole cost column behind any endpoint that reports nothing.
 */
export function zeroUsage(): LlmUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reportedCostMicroUsd: null,
  };
}

/**
 * Adds one attempt's usage to a running total.
 *
 * A repair is a second paid round-trip, so both attempts have to land on the
 * row: the coach is not charged a second credit, but the tokens were spent and
 * the ledger should say so. `null` cost stays `null` — see {@link zeroUsage}.
 */
export function addUsage(total: LlmUsage, next: LlmUsage): LlmUsage {
  return {
    inputTokens: (total.inputTokens ?? 0) + (next.inputTokens ?? 0),
    cachedInputTokens:
      (total.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0),
    cacheWriteTokens:
      (total.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
    outputTokens: (total.outputTokens ?? 0) + (next.outputTokens ?? 0),
    reportedCostMicroUsd:
      next.reportedCostMicroUsd === null
        ? total.reportedCostMicroUsd
        : (total.reportedCostMicroUsd ?? 0) + next.reportedCostMicroUsd,
  };
}

/**
 * Asks the model for JSON, **once**, and validates the answer.
 *
 * One call per generation is a hard rule, not a budget preference. The previous
 * shape sent a second "repair" turn whenever the answer missed the coach's
 * targets or referenced a catalog row that does not exist, and it was wrong on
 * both counts:
 *
 * - **The targets were already being fixed by arithmetic anyway.** `rebalance`
 *   runs after this and fits the portions to the kcal and macro targets exactly.
 *   The repair turn spent an entire extra round-trip — and the coach's waiting —
 *   asking a language model to do the sum that the very next function does for
 *   certain.
 * - **A bad catalog index does not need the model either.** The offending item
 *   is dropped and the plan re-fitted; see `salvage.ts`.
 *
 * What is left over — a plate the server can object to but not fix, like two
 * staples in one meal — is delivered as a draft and logged. A coach fixes that
 * in thirty seconds; a second call fixes it in thirty seconds *and* another few
 * thousand tokens, and only sometimes.
 */
async function ask<T>(
  provider: LlmProvider,
  args: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    parse: (json: unknown) => { ok: true; plan: T } | { ok: false };
  },
): Promise<
  | { ok: true; plan: T; usage: LlmUsage; call: LlmCall | null }
  | {
      ok: false;
      errorCode: string;
      message: string;
      usage: LlmUsage;
      call: LlmCall | null;
    }
> {
  const result = await provider.generateJson({
    system: args.system,
    user: args.user,
    schemaName: args.schemaName,
    schema: args.schema,
  });
  if (!result.ok) {
    // A refusal or a truncated answer still consumed tokens and still lands on
    // the invoice, so it is recorded rather than written off as free.
    return {
      ok: false,
      errorCode: result.reason,
      message: result.message,
      usage: result.usage ?? zeroUsage(),
      call: result.call ?? null,
    };
  }

  const parsed = args.parse(result.json);
  if (!parsed.ok) {
    return {
      ok: false,
      errorCode: "invalid_shape",
      message: "O modelo não seguiu o formato pedido.",
      usage: result.usage,
      call: result.call,
    };
  }
  return {
    ok: true,
    plan: parsed.plan,
    usage: result.usage,
    call: result.call,
  };
}

/**
 * The quantity as it will be stored: grams, plus the household portion when the
 * model prescribed one and the food really has one.
 *
 * **Grams are recomputed from the count**, never taken from the model when both
 * are present. A model that answers "2 fatias, 60 g" for a 25 g slice has said
 * two different things; trusting the count keeps the label and the number
 * agreeing, and the count is the one the aluno will act on.
 */
function householdPortion(
  item: { grams: number; measures?: number | null },
  facts: { measureLabel: string | null; measureGrams: number | null } | undefined,
): { grams: number; measureLabel?: string; measureGrams?: number } {
  const count = item.measures ?? null;
  if (
    count === null ||
    !facts ||
    facts.measureLabel === null ||
    facts.measureGrams === null ||
    facts.measureGrams <= 0
  ) {
    return { grams: item.grams };
  }
  return {
    grams: count * facts.measureGrams,
    measureLabel: facts.measureLabel,
    measureGrams: facts.measureGrams,
  };
}

/** Everything the generators need once every gate has passed. */
type Preflight = {
  provider: LlmProvider;
  studentName: string;
  anamnesis: NonNullable<
    Awaited<ReturnType<typeof studentAnamneses.getStudentAnamnesis>>
  >;
  limit: number | null;
  used: number;
};

/**
 * Shared preflight: provider, student, anamnese, concurrency, quota — in that
 * order, so the cheapest and most explicable refusal wins. Discriminated on
 * `refusal` so callers narrow cleanly.
 */
async function preflight(
  ctx: TenantContext,
  studentId: string,
  kind: AiGenerationKind,
): Promise<{ refusal: GenerateRefusal } | Preflight> {
  // The key decides whether the feature is on; the models come from
  // `ai_settings`, so an admin changing one takes effect on the next generation
  // with no restart. Read before the other gates so an unconfigured install
  // still short-circuits without touching the database.
  if (!isLlmConfigured()) return { refusal: "not_configured" as const };
  const provider = getLlmProvider(await aiSettings.getAiSettings(ctx.db));
  if (!provider.canGenerate) return { refusal: "not_configured" as const };

  const student = await students.getStudent(ctx, studentId);
  if (!student) return { refusal: "not_found" as const };

  // Health-adjacent output for a real person: without a filled anamnese the
  // model has no weight, age or history and will produce confident nonsense.
  const anamnesis = await studentAnamneses.getStudentAnamnesis(ctx, studentId);
  if (!anamnesis || anamnesis.status !== "completed") {
    return { refusal: "no_anamnesis" as const };
  }

  if (await ai.hasPendingGeneration(ctx, studentId, kind)) {
    return { refusal: "already_running" as const };
  }

  const [limit, used] = await Promise.all([
    plans.getAiGenerationLimit(ctx),
    ai.countGenerationsThisMonth(ctx),
  ]);
  if (limit !== null && used >= limit) {
    return { refusal: "quota_exceeded" as const };
  }

  // `students` stores the name split; the prompt wants it whole.
  const studentName = `${student.firstName} ${student.lastName}`.trim();
  return { provider, studentName, anamnesis, limit, used };
}

/**
 * One generation's `pending` row, recorded by the body so the guard can settle
 * it. `id` stays `null` until {@link ai.startGeneration} has actually written it
 * — a throw before that has no row to settle.
 *
 * `usage` and `call` are filled in once the model has answered, so that a throw
 * *after* the call still lands the tokens on the row. Releasing the credit
 * without recording the spend would hide real money from the ledger.
 */
type PendingRow = {
  id: string | null;
  startedAt: number;
  usage: LlmUsage | null;
  call: LlmCall | null;
};

/**
 * Runs one generation, guaranteeing its audit row is settled even when the body
 * throws.
 *
 * Every *known* failure inside `generateWorkout`/`generateDiet` settles the row
 * itself and returns. This covers the rest: a DB error inside `saveAsDraft`, or
 * anything else unforeseen. `withRoute` catches the throw and answers 500, so
 * without this the row would stay `pending` — permanently blocking that aluno
 * via `hasPendingGeneration` and burning a credit for the month.
 *
 * Settling is idempotent (`failGenerationIfPending` only touches a row that is
 * still `pending`), so a throw raised after the row was already settled leaves
 * the real outcome standing.
 */
async function withSettledRow(
  ctx: TenantContext,
  run: (row: PendingRow) => Promise<GenerateResult>,
): Promise<GenerateResult> {
  const row: PendingRow = { id: null, startedAt: 0, usage: null, call: null };
  try {
    return await run(row);
  } catch (error) {
    if (row.id) {
      // Best-effort: if settling itself fails there is nothing further to do,
      // and the original error is the one worth propagating. The staleness
      // cutoff in the DAL is the backstop for exactly this case.
      await ai
        .failGenerationIfPending(ctx, row.id, "unexpected", {
          // The credit goes back; the tokens do not. Same rule the known
          // failure paths follow — see `failGeneration` in the DAL.
          usage: row.usage ?? undefined,
          call: row.call,
          durationMs: Date.now() - row.startedAt,
        })
        .catch(() => {});
    }
    throw error;
  }
}

/** Generates a workout draft for the student. */
export async function generateWorkout(
  ctx: TenantContext,
  studentId: string,
  input: AiWorkoutGenerateInput,
): Promise<GenerateResult> {
  return withSettledRow(ctx, async (row) => {
  const pre = await preflight(ctx, studentId, "workout");
  if ("refusal" in pre) return { ok: false, refusal: pre.refusal };
  const { provider, studentName, anamnesis, limit, used } = pre;

  const catalog = await buildExerciseCatalog(ctx);
  const generationId = await ai.startGeneration(ctx, {
    studentId,
    kind: "workout",
    provider: provider.name,
    model: provider.model,
    catalogHash: catalog.hash,
    anamnesisSnapshotId: anamnesis.id,
  });
  const startedAt = Date.now();
  row.id = generationId;
  row.startedAt = startedAt;

  const asked = await ask<WorkoutPlan>(provider, {
    system: workoutSystemPrompt(catalog),
    user: userPrompt({
      studentName,
      sections: anamnesis.sections,
      answers: anamnesis.answers,
      input,
      kind: "workout",
    }),
    schemaName: "treino",
    schema: WORKOUT_JSON_SCHEMA,
    parse: (json) => {
      const r = workoutPlanSchema.safeParse(json);
      return r.success ? { ok: true, plan: r.data } : { ok: false };
    },
  });

  const durationMs = Date.now() - startedAt;
  // Past this point a throw has real spend behind it.
  row.usage = asked.usage;
  row.call = asked.call;
  if (!asked.ok) {
    await ai.failGeneration(ctx, generationId, asked.errorCode, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: asked.message };
  }

  // A hallucinated index costs that exercise, not the generation and not a
  // second call: it is dropped and the rest of the treino stands.
  const salvaged = dropUnknownExercises(asked.plan, catalog);
  if (!salvaged.ok) {
    logger.warn("ai.unsalvageable", {
      kind: "workout",
      dropped: salvaged.dropped.slice(0, 10),
    });
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }
  if (salvaged.dropped.length > 0) {
    logger.warn("ai.dropped_exercises", { dropped: salvaged.dropped.slice(0, 10) });
  }
  const plan = salvaged.plan;

  const ids = resolveIndices(catalog, workoutIndices(plan));
  // Every remaining index came out of the catalog map above; this narrows.
  if (!ids.ok) {
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }

  const write: WorkoutWriteInput = {
    name: plan.name,
    notes: plan.notes,
    sessions: plan.sessions.map((s) => ({
      name: s.name,
      exercises: s.exercises.map((e) => ({
        exerciseId: ids.ids.get(e.exercise)!,
        sets: e.sets,
        reps:
          e.reps.length === 1
            ? { kind: "fixed" as const, value: e.reps[0] }
            : { kind: "range" as const, values: e.reps },
        load: null,
        rest: e.rest,
        note: e.note,
        technique: null,
        groupId: null,
        customSubstitutes: [],
      })),
    })),
  };

  const saved = await saveAsDraft(ctx, studentId, "workout", write);
  if (!saved.ok) {
    await ai.failGeneration(ctx, generationId, saved.reason, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: saved.message };
  }

  await ai.finishGeneration(ctx, generationId, {
    usage: asked.usage,
    call: asked.call,
    durationMs,
    // `repaired` now means "the SERVER had to fix the answer" — here, an
    // exercise the model invented. It never means a second call; see `ask`.
    repaired: salvaged.dropped.length > 0,
  });
  return {
    ok: true,
    used: used + 1,
    limit,
    repaired: salvaged.dropped.length > 0,
  };
  });
}

/** Generates a diet draft for the student. */
export async function generateDiet(
  ctx: TenantContext,
  studentId: string,
  input: AiDietGenerateInput,
): Promise<GenerateResult> {
  return withSettledRow(ctx, async (row) => {
  const pre = await preflight(ctx, studentId, "diet");
  if ("refusal" in pre) return { ok: false, refusal: pre.refusal };
  const { provider, studentName, anamnesis, limit, used } = pre;

  const catalog = await buildFoodCatalog(ctx);

  // Continuity: unless the coach asked for a reset, the aluno's current diet
  // goes into the prompt as the thing being adjusted. Read before the credit is
  // claimed — this is a plain query and failing it should not cost anything.
  let baseline: string | null = null;
  if (!input.fromScratch) {
    const state = await studentDiets.getStudentDietState(ctx, studentId);
    // A draft in flight beats the published one: it is the coach's newest
    // thinking, and adjusting away from it would undo edits they just made.
    const tree = state?.draft?.tree ?? state?.current?.tree ?? null;
    // An empty tree is not a baseline: "keep what is here" over zero meals is
    // an instruction with nothing to act on.
    if (tree && tree.meals.length > 0) {
      baseline = renderDietBaseline(tree, catalog);
    }
  }

  const generationId = await ai.startGeneration(ctx, {
    studentId,
    kind: "diet",
    provider: provider.name,
    model: provider.model,
    catalogHash: catalog.hash,
    anamnesisSnapshotId: anamnesis.id,
  });
  const startedAt = Date.now();
  row.id = generationId;
  row.startedAt = startedAt;

  const asked = await ask<DietPlan>(provider, {
    system: dietSystemPrompt(catalog),
    user: userPrompt({
      studentName,
      sections: anamnesis.sections,
      answers: anamnesis.answers,
      input,
      kind: "diet",
      baseline,
      // The avoided foods, resolved to the exact catalog numbers they match.
      // Naming the rows is what makes "não come peixe" enforceable on the
      // FIRST call — the model no longer has to work out which of 600 lines
      // count as fish.
      forbidden: forbiddenIndices(catalog, input.avoid),
    }),
    schemaName: "dieta",
    schema: DIET_JSON_SCHEMA,
    parse: (json) => {
      const r = dietPlanSchema.safeParse(json);
      return r.success ? { ok: true, plan: r.data } : { ok: false };
    },
  });

  const durationMs = Date.now() - startedAt;
  // Past this point a throw has real spend behind it.
  row.usage = asked.usage;
  row.call = asked.call;
  if (!asked.ok) {
    await ai.failGeneration(ctx, generationId, asked.errorCode, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: asked.message };
  }

  // Same as the treino: an invented food costs that item, not the generation
  // and not a second call. The hole closes on its own — `rebalance` below
  // re-fits the remaining portions to the coach's targets.
  const salvaged = dropUnknownFoods(asked.plan, catalog);
  if (!salvaged.ok) {
    logger.warn("ai.unsalvageable", {
      kind: "diet",
      dropped: salvaged.dropped.slice(0, 10),
    });
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }
  if (salvaged.dropped.length > 0) {
    logger.warn("ai.dropped_foods", { dropped: salvaged.dropped.slice(0, 10) });
  }

  const ids = resolveIndices(catalog, dietIndices(salvaged.plan));

  if (!ids.ok) {
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }

  // The model has had its say, including its free repair turn. What the coach
  // asked for in numbers is now settled by arithmetic rather than by asking
  // again: 2600 kcal came back as 2827 and then 3214, and a low-carb 2500 came
  // back at 1832 with 61% of the calories from carbohydrate. Only quantities
  // move — the food selection and the meal order are the model's work.
  const fitted = rebalance(
    salvaged.plan,
    catalog.foods,
    input,
    // The anamnese is not only prose for the model to read: the aluno's weight
    // is what turns "alta proteína" into a number of grams.
    bodyWeightKg(anamnesis.answers),
  );
  if (fitted.changed) {
    logger.info("ai.diet_rebalanced", {
      beforeKcal: Math.round(fitted.before.kcal),
      afterKcal: Math.round(fitted.after.kcal),
      targetKcal: fitted.targets ? Math.round(fitted.targets.kcal) : null,
    });
  }

  // What the server can still prove wrong about the FINAL plan — after the
  // portions were fitted, so the numbers here are the ones the coach will see.
  // Logged, not re-asked: these are either already settled by the arithmetic
  // above, or they are a plate a coach fixes in thirty seconds. A second model
  // call to argue about them would cost more than it saves.
  const problems = dietProblems(fitted.plan, catalog, input);
  if (problems.length > 0) {
    logger.warn("ai.diet_problems", { problems: problems.slice(0, 4) });
  }

  const write: DietWriteInput = {
    name: fitted.plan.name,
    // Said out loud, because a coach comparing the plan to what the model
    // wrote in its own observações deserves to know which numbers are final.
    notes: fitted.changed
      ? [
          fitted.plan.notes,
          `Porções ajustadas pelo sistema para fechar as metas: ${Math.round(fitted.after.kcal)} kcal, `
            + `${Math.round(fitted.after.protein)} g de proteína, `
            + `${Math.round(fitted.after.carbs)} g de carboidrato, `
            + `${Math.round(fitted.after.fat)} g de gordura.`,
        ]
          .filter((n): n is string => Boolean(n))
          .join("\n\n")
      : fitted.plan.notes,
    meals: fitted.plan.meals.map((m) => ({
      name: m.name,
      time: m.time,
      items: m.items.map((i) => ({
        foodId: ids.ids.get(i.food)!,
        ...householdPortion(i, catalog.foods.get(i.food)),
        substitutes: [],
      })),
    })),
  };

  const saved = await saveAsDraft(ctx, studentId, "diet", write);
  if (!saved.ok) {
    await ai.failGeneration(ctx, generationId, saved.reason, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: saved.message };
  }

  // `repaired` counts what the MODEL got wrong, not what the pipeline routinely
  // does: `rebalance` runs on every diet, so folding it in here would light the
  // flag on every row and tell /admin/ai nothing. A dropped food is the real
  // signal — the model referenced a catalog row that does not exist.
  const repaired = salvaged.dropped.length > 0;
  await ai.finishGeneration(ctx, generationId, {
    usage: asked.usage,
    call: asked.call,
    durationMs,
    repaired,
  });
  return { ok: true, used: used + 1, limit, repaired };
  });
}

/**
 * Writes the generated plan into the student's **draft**, creating one first if
 * none exists. Never publishes: nothing reaches the aluno unreviewed.
 *
 * Overwriting an existing draft is intentional — the route only gets here after
 * the coach confirmed it in the dialog.
 */
async function saveAsDraft(
  ctx: TenantContext,
  studentId: string,
  kind: AiGenerationKind,
  write: WorkoutWriteInput | DietWriteInput,
): Promise<{ ok: true } | { ok: false; reason: string; message: string }> {
  const dal = kind === "workout" ? studentWorkouts : studentDiets;
  // `createBlankDraft` reports `has_draft` when one already exists, which is the
  // signal to overwrite it instead — the coach already confirmed.
  const created = await dal.createBlankDraft(ctx, studentId, write.name);
  if (!created.ok && created.reason !== "has_draft") {
    return {
      ok: false,
      reason: created.reason,
      message: "Não foi possível criar o rascunho.",
    };
  }

  const saved =
    kind === "workout"
      ? await studentWorkouts.saveDraft(ctx, studentId, write as WorkoutWriteInput)
      : await studentDiets.saveDraft(ctx, studentId, write as DietWriteInput);
  if (!saved.ok) {
    return {
      ok: false,
      reason: saved.reason,
      message: "O programa gerado não pôde ser salvo.",
    };
  }
  return { ok: true };
}
