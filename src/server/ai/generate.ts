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
import type { TenantContext } from "@/server/tenant";
import {
  buildExerciseCatalog,
  buildFoodCatalog,
  resolveIndices,
  type CatalogBlock,
} from "./catalog";
import {
  dietSystemPrompt,
  repairPrompt,
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

/**
 * The generation service: quota → model → validate → repair → draft.
 *
 * Everything here is orchestration; the interesting invariants live in the
 * pieces it calls. Two are worth restating because they are easy to break:
 *
 * - **The audit row is written before the model call and settled after.** That
 *   two-phase shape is what makes a failure free while still stopping two
 *   concurrent requests from sharing one credit. Every exit path below must
 *   settle the row — an abandoned `pending` silently costs the coach a credit.
 * - **The repair retry is free.** A hallucinated catalog index costs tokens, not
 *   a credit; only the second failure ends the generation.
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
 * Asks the model for JSON, validates it, and retries **once** if it referenced
 * catalog numbers that don't exist.
 *
 * Returns the parsed plan plus the accumulated usage across both attempts — the
 * coach isn't charged a second credit for a repair, but we did spend the tokens
 * and the cost ledger should say so.
 */
async function askWithRepair<T>(
  provider: LlmProvider,
  args: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    parse: (json: unknown) => { ok: true; plan: T } | { ok: false };
    indicesOf: (plan: T) => number[];
    catalog: CatalogBlock;
  },
): Promise<
  | { ok: true; plan: T; usage: LlmUsage; call: LlmCall | null; repaired: boolean }
  | {
      ok: false;
      errorCode: string;
      message: string;
      usage: LlmUsage;
      call: LlmCall | null;
    }
> {
  let total = zeroUsage();
  const add = (u: LlmUsage) => {
    total = addUsage(total, u);
  };

  // Which model actually answered, from the **last** attempt: a repair can be
  // served by a different model than the first try when a fallback fires, and
  // the row should name the one whose answer we kept.
  let call: LlmCall | null = null;

  let user = args.user;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await provider.generateJson({
      system: args.system,
      user,
      schemaName: args.schemaName,
      schema: args.schema,
    });
    if (!result.ok) {
      // A refusal or a truncated answer still consumed tokens and still lands on
      // the invoice, so it is accumulated rather than written off as free.
      if (result.usage) add(result.usage);
      if (result.call) call = result.call;
      return {
        ok: false,
        errorCode: result.reason,
        message: result.message,
        usage: total,
        call,
      };
    }
    add(result.usage);
    call = result.call;

    const parsed = args.parse(result.json);
    if (!parsed.ok) {
      // Shape is wrong — the provider ignored the schema, or drifted. Worth one
      // retry too: the repair prompt restates the contract.
      if (attempt === 0) {
        user = repairPrompt(args.user, []);
        continue;
      }
      return {
        ok: false,
        errorCode: "invalid_shape",
        message: "O modelo não seguiu o formato pedido.",
        usage: total,
        call,
      };
    }

    const check = resolveIndices(args.catalog, args.indicesOf(parsed.plan));
    if (check.ok) {
      return {
        ok: true,
        plan: parsed.plan,
        usage: total,
        call,
        repaired: attempt > 0,
      };
    }
    if (attempt === 0) {
      logger.warn("ai.invalid_indices", { invalid: check.invalid.slice(0, 10) });
      user = repairPrompt(args.user, check.invalid);
      continue;
    }
    return {
      ok: false,
      errorCode: "invalid_ids",
      message: "O modelo insistiu em itens que não existem no catálogo.",
      usage: total,
      call,
    };
  }
  // Unreachable — the loop returns on every path.
  return {
    ok: false,
    errorCode: "invalid_ids",
    message: "Não foi possível gerar um programa válido.",
    usage: total,
    call,
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

/** Generates a workout draft for the student. */
export async function generateWorkout(
  ctx: TenantContext,
  studentId: string,
  input: AiWorkoutGenerateInput,
): Promise<GenerateResult> {
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

  const asked = await askWithRepair<WorkoutPlan>(provider, {
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
    indicesOf: workoutIndices,
    catalog,
  });

  const durationMs = Date.now() - startedAt;
  if (!asked.ok) {
    await ai.failGeneration(ctx, generationId, asked.errorCode, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: asked.message };
  }

  const ids = resolveIndices(catalog, workoutIndices(asked.plan));
  // Already validated inside askWithRepair; this narrows the type.
  if (!ids.ok) {
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }

  const write: WorkoutWriteInput = {
    name: asked.plan.name,
    notes: asked.plan.notes,
    sessions: asked.plan.sessions.map((s) => ({
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
    repaired: asked.repaired,
  });
  return { ok: true, used: used + 1, limit, repaired: asked.repaired };
}

/** Generates a diet draft for the student. */
export async function generateDiet(
  ctx: TenantContext,
  studentId: string,
  input: AiDietGenerateInput,
): Promise<GenerateResult> {
  const pre = await preflight(ctx, studentId, "diet");
  if ("refusal" in pre) return { ok: false, refusal: pre.refusal };
  const { provider, studentName, anamnesis, limit, used } = pre;

  const catalog = await buildFoodCatalog(ctx);
  const generationId = await ai.startGeneration(ctx, {
    studentId,
    kind: "diet",
    provider: provider.name,
    model: provider.model,
    catalogHash: catalog.hash,
    anamnesisSnapshotId: anamnesis.id,
  });
  const startedAt = Date.now();

  const asked = await askWithRepair<DietPlan>(provider, {
    system: dietSystemPrompt(catalog),
    user: userPrompt({
      studentName,
      sections: anamnesis.sections,
      answers: anamnesis.answers,
      input,
      kind: "diet",
    }),
    schemaName: "dieta",
    schema: DIET_JSON_SCHEMA,
    parse: (json) => {
      const r = dietPlanSchema.safeParse(json);
      return r.success ? { ok: true, plan: r.data } : { ok: false };
    },
    indicesOf: dietIndices,
    catalog,
  });

  const durationMs = Date.now() - startedAt;
  if (!asked.ok) {
    await ai.failGeneration(ctx, generationId, asked.errorCode, {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: asked.message };
  }

  const ids = resolveIndices(catalog, dietIndices(asked.plan));
  if (!ids.ok) {
    await ai.failGeneration(ctx, generationId, "invalid_ids", {
      usage: asked.usage,
      call: asked.call,
      durationMs,
    });
    return { ok: false, failed: true, message: "Itens inválidos no catálogo." };
  }

  const write: DietWriteInput = {
    name: asked.plan.name,
    notes: asked.plan.notes,
    meals: asked.plan.meals.map((m) => ({
      name: m.name,
      time: m.time,
      items: m.items.map((i) => ({
        foodId: ids.ids.get(i.food)!,
        grams: i.grams,
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

  await ai.finishGeneration(ctx, generationId, {
    usage: asked.usage,
    call: asked.call,
    durationMs,
    repaired: asked.repaired,
  });
  return { ok: true, used: used + 1, limit, repaired: asked.repaired };
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
