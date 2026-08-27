import { MEAL_SLOT_VALUES } from "@/lib/meals";
import { z } from "@/lib/validation";

import type { AiSettingsDto } from "@/lib/ai-settings";

/**
 * Client-safe contract for the AI program generator: the dialog's form shape,
 * its PT-BR option labels, and the response DTO.
 *
 * Kept free of server imports so it bundles into the client component that
 * renders the dialog.
 */

/**
 * What equipment the aluno actually has. Drives which exercises make sense.
 *
 * **Only offer what the catalog can actually fill.** The generator sends the
 * whole exercise catalog and asks the model to respect this list; an option with
 * no real backing produces a program built out of the model's imagination and
 * then rejected by the index check, or — worse — a thin one it padded from
 * elsewhere. `Elásticos` was removed for exactly that reason: the base catalog's
 * `bands` rows are too few to build a week from, and they are labelled
 * "Faixas elásticas" there, so the model was also being asked to match a term
 * the catalog never uses.
 */
export const AI_EQUIPMENT_VALUES = [
  "academia",
  "halteres",
  "peso_corporal",
] as const;
export type AiEquipment = (typeof AI_EQUIPMENT_VALUES)[number];

export const AI_EQUIPMENT_LABELS: Record<AiEquipment, string> = {
  academia: "Academia completa",
  halteres: "Halteres",
  peso_corporal: "Peso corporal",
};

/** Dietary restrictions. Deliberately the common cases, not an ontology. */
export const AI_RESTRICTION_VALUES = [
  "vegetariano",
  "vegano",
  "sem_lactose",
  "sem_gluten",
] as const;
export type AiRestriction = (typeof AI_RESTRICTION_VALUES)[number];

export const AI_RESTRICTION_LABELS: Record<AiRestriction, string> = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  sem_lactose: "Sem lactose",
  sem_gluten: "Sem glúten",
};

/**
 * How the day's calories should be split — the shape of the plan, as opposed to
 * `restrictions` (what is forbidden) or the gram targets (exact numbers).
 *
 * This is the answer most coaches actually have. Very few carry "180 g de
 * proteína, 60 g de gordura" for every aluno; nearly all of them know they want
 * this one high in protein and low in carbohydrate. Without it that intent had
 * only two outlets — invent four numbers, or write it into the free-text
 * objective and hope the model reads it as a macro instruction.
 *
 * There is deliberately **no "baixa proteína"**. It is not a thing anyone
 * prescribes for a training aluno, and offering it would make the low end of
 * protein look like a legitimate goal rather than the failure it is.
 */
export const AI_MACRO_PROFILE_VALUES = [
  "alta_proteina",
  "alto_carbo",
  "baixo_carbo",
  "baixa_gordura",
] as const;
export type AiMacroProfile = (typeof AI_MACRO_PROFILE_VALUES)[number];

export const AI_MACRO_PROFILE_LABELS: Record<AiMacroProfile, string> = {
  alta_proteina: "Alta proteína",
  alto_carbo: "Alto carboidrato",
  baixo_carbo: "Baixo carboidrato",
  baixa_gordura: "Baixa gordura",
};

/**
 * Profile pairs that describe no buildable day. Kept here, next to the values,
 * because both the schema and the dialog have to agree on them.
 *
 * - **alto + baixo carbo** is a straight contradiction.
 * - **baixo carbo + baixa gordura** is the subtler one, and the reason this
 *   list exists at all: energy has to come from somewhere. Cut both and the
 *   only macro left carrying the calories is protein, which is neither what the
 *   coach meant nor something to feed a real person.
 */
export const AI_MACRO_PROFILE_CONFLICTS: [AiMacroProfile, AiMacroProfile, string][] =
  [
    [
      "alto_carbo",
      "baixo_carbo",
      "Escolha alto ou baixo carboidrato — não os dois.",
    ],
    [
      "baixo_carbo",
      "baixa_gordura",
      "Baixo carboidrato com baixa gordura não fecha as calorias — escolha um.",
    ],
  ];

/** The first conflict present in a selection, or `null`. */
export function macroProfileConflict(
  profiles: readonly AiMacroProfile[],
): string | null {
  const chosen = new Set(profiles);
  for (const [a, b, message] of AI_MACRO_PROFILE_CONFLICTS) {
    if (chosen.has(a) && chosen.has(b)) return message;
  }
  return null;
}

/**
 * The generate forms — **one per kind**, because the two generators need
 * genuinely different answers.
 *
 * A single shared form was the original shape and it was wrong in both
 * directions: it made a coach tick gym equipment before it would generate a
 * *dieta*, and it fed dietary restrictions into a *treino* prompt whose rules
 * never mention them. Splitting the schema is what lets each dialog ask only
 * what its own prompt can actually use.
 *
 * Every field is **required**, but the dialog prefills what it already knows
 * (`objective` from the aluno's goal, the counts from their defaults) — so
 * "required" means *confirmed*, not *retyped*. Equipment and restrictions are
 * asked here precisely because the anamnese does not collect them.
 */
const objectiveField = z
  .string()
  .trim()
  .min(3, "Descreva o objetivo.")
  .max(200, "Objetivo muito longo.");

/**
 * An optional free-text note that reaches the prompt. Normalised to `null` when
 * blank so the renderer can skip the line entirely rather than sending the
 * model an empty label to interpret.
 */
/**
 * An optional whole-number field. Accepts `null` and — because an emptied number
 * input yields `NaN` through `Number("")` — treats a non-finite value as "not
 * given" rather than letting it reach the prompt as a target of NaN.
 */
const optionalPositiveInt = (max: number, message: string) =>
  z
    .number()
    .nullable()
    .transform((v) => (v === null || !Number.isFinite(v) ? null : v))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v > 0 && v <= max),
      message,
    );

const freeNote = z
  .string()
  .trim()
  .max(300, "Texto muito longo.")
  .transform((v) => (v === "" ? null : v))
  .nullable();

/** Treino: what the aluno can train with, and how often. */
export const aiWorkoutGenerateSchema = z.object({
  objective: objectiveField,
  equipment: z
    .array(z.enum(AI_EQUIPMENT_VALUES))
    .min(1, "Escolha ao menos um equipamento disponível."),
  daysPerWeek: z
    .number()
    .int("Informe um número inteiro de dias.")
    .min(1, "Mínimo de 1 dia por semana.")
    .max(7, "Máximo de 7 dias por semana."),
});

/**
 * Dieta: what the aluno can't eat, and how the day is split.
 *
 * `restrictions` may be an empty array: "no restrictions" is a real answer, and
 * a required field that cannot be answered "none" is a broken form.
 */
export const aiDietGenerateSchema = z
  .object({
    objective: objectiveField,
    restrictions: z.array(z.enum(AI_RESTRICTION_VALUES)),
    /**
     * The meals to build, named. May be empty — see `mealsPerDay`.
     *
     * Naming them is what lets the prompt refuse arroz-e-feijão at 7h, so it is
     * the answer worth giving; it is not the only allowed one, because a coach
     * who only cares that the day has six meals should not have to invent a
     * split to say so.
     */
    meals: z.array(z.enum(MEAL_SLOT_VALUES)),
    /**
     * The macro shape, none to several. Empty is the normal answer: no profile
     * means "balance it yourself from the anamnese", same as a blank target.
     */
    macroProfiles: z.array(z.enum(AI_MACRO_PROFILE_VALUES)),
    /**
     * How many meals the day should have, or `null` to let `meals` decide.
     *
     * With `meals` this is the **total**, and the named slots are the mandatory
     * part of it — the model fills the remainder from the slots that were left
     * unticked. Alone, it hands the split to the model entirely.
     */
    mealsPerDay: z
      .number()
      .nullable()
      .transform((v) => (v === null || !Number.isFinite(v) ? null : v))
      .refine(
        (v) =>
          v === null || (Number.isInteger(v) && v >= 2 && v <= MEAL_SLOT_VALUES.length),
        `Informe de 2 a ${MEAL_SLOT_VALUES.length} refeições por dia.`,
      ),
    /**
     * Foods the aluno actually likes, free text. A plan built only from what is
     * *allowed* is a plan nobody follows — the restrictions say what is
     * forbidden, this says what will actually get eaten.
     */
    preferences: freeNote,
    /**
     * Foods to keep out, free text. Distinct from `restrictions`: those are four
     * coded diets, this is "odeia jiló, não come peixe" — the specific aversions
     * no checkbox list will ever cover, and the ones an aluno notices first.
     */
    avoid: freeNote,
    /**
     * Ignore the aluno's current diet and start over.
     *
     * Default **false**, and that default is the whole point: a monthly review is
     * an *adjustment*, not a new prescription. A coach who has spent three cycles
     * learning that this aluno actually eats the tapioca and skips the salada
     * loses all of it when the model starts from a blank page — and the aluno,
     * who was adhering, is handed a stranger's plan. Ticking this is for a real
     * reset (goal changed, injury, the plan is not working).
     */
    fromScratch: z.boolean(),
    /**
     * Optional targets. Null means "you work it out from the anamnese" — which is
     * the honest default, because most coaches do not carry a kcal figure in
     * their head for every aluno. When given they are a hard target, not a hint.
     */
    targetKcal: optionalPositiveInt(6000, "Calorias fora do intervalo aceito."),
    targetProteinG: optionalPositiveInt(500, "Proteína fora do intervalo aceito."),
    targetCarbsG: optionalPositiveInt(1000, "Carboidrato fora do intervalo aceito."),
    targetFatG: optionalPositiveInt(400, "Gordura fora do intervalo aceito."),
  })
  /**
   * The day has to be pinned down one way or the other, and a total below the
   * number of meals already ticked is not a shape anyone can build.
   */
  .superRefine((v, ctx) => {
    if (v.meals.length === 0 && v.mealsPerDay === null) {
      ctx.addIssue({
        code: "custom",
        path: ["meals"],
        message: "Escolha as refeições ou informe quantas por dia.",
      });
    }
    if (v.mealsPerDay !== null && v.mealsPerDay < v.meals.length) {
      ctx.addIssue({
        code: "custom",
        path: ["mealsPerDay"],
        message:
          "O total de refeições não pode ser menor que as refeições escolhidas.",
      });
    }
    const conflict = macroProfileConflict(v.macroProfiles);
    if (conflict !== null) {
      ctx.addIssue({ code: "custom", path: ["macroProfiles"], message: conflict });
    }
  });

export type AiWorkoutGenerateInput = z.infer<typeof aiWorkoutGenerateSchema>;
export type AiDietGenerateInput = z.infer<typeof aiDietGenerateSchema>;
export type AiGenerateInput = AiWorkoutGenerateInput | AiDietGenerateInput;

/**
 * A number input's value as a number, or `null` when left blank.
 *
 * The empty check comes first because `Number("")` is `0`, not `NaN` — without
 * it, clearing the kcal box would send a target of zero calories rather than
 * "no opinion". An emptied `<input type="number">` also yields `NaN`, which
 * `JSON.stringify` turns into `null` on the way out; this makes that explicit
 * instead of relying on it.
 */
export function numOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** What the dialogs open with, so the coach confirms rather than types. */
export const AI_DEFAULT_DAYS_PER_WEEK = 3;


/** What the generate endpoints return on success. */
export type AiGenerateResultDto = {
  /** Credits used / allowed this month, after this generation. */
  used: number;
  limit: number | null;
  /**
   * Whether the server had to correct the model's answer — an invented catalog
   * item was dropped. Never a second model call: a generation is exactly one.
   */
  repaired: boolean;
};

/**
 * Why a generation was refused before the model was ever called. The UI maps
 * these to specific copy so the coach knows what to fix, rather than a generic
 * failure toast.
 */
export const AI_REFUSAL_CODES = [
  "not_configured",
  "no_anamnesis",
  "quota_exceeded",
  "already_running",
] as const;
export type AiRefusalCode = (typeof AI_REFUSAL_CODES)[number];

export const AI_REFUSAL_MESSAGES: Record<AiRefusalCode, string> = {
  not_configured: "A geração por IA ainda não está configurada nesta instalação.",
  no_anamnesis:
    "Este aluno precisa de uma anamnese preenchida antes de gerar um programa.",
  quota_exceeded:
    "Você já usou todas as gerações de IA deste mês. O limite renova no dia 1º.",
  already_running: "Já existe uma geração em andamento para este aluno.",
};

/** "3 de 10 gerações usadas este mês" / "3 gerações usadas este mês". */
export function formatAiUsage(used: number, limit: number | null): string {
  const plural = used === 1 ? "geração usada" : "gerações usadas";
  return limit === null
    ? `${used} ${plural} este mês`
    : `${used} de ${limit} ${plural} este mês`;
}

/* -------------------------------------------------------------------------- */
/* Platform-admin overview                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One clinic's month of AI usage, as `/admin/ai` lists it. Mirrors
 * `AdminAiTenantRow` in the DAL with dates already serialised.
 */
export type AdminAiTenantDto = {
  clinicId: string;
  name: string;
  plan: string;
  effectivePlan: string;
  limit: number | null;
  used: number;
  succeeded: number;
  failed: number;
  repaired: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /**
   * What the month cost: the provider's own figure per row where it gave one,
   * the `provider_price` estimate otherwise. `null` = nothing costable.
   */
  costMicroUsd: number | null;
  /** The measured slice of `costMicroUsd`. */
  reportedCostMicroUsd: number | null;
  /** Generations that reported no cost and had no price in force either. */
  unpricedGenerations: number;
};

/** One model's month across every tenant, as the Modelos table lists it. */
export type AdminAiModelDto = {
  model: string;
  upstreamProviders: string[];
  generations: number;
  succeeded: number;
  failed: number;
  repaired: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costMicroUsd: number | null;
  reportedCostMicroUsd: number | null;
  /** Generations that actually contributed to `costMicroUsd`. */
  costedGenerations: number;
  unpricedGenerations: number;
};

export type AdminAiOverviewDto = {
  /** Whether an LLM is configured at all — an empty table means two things. */
  configured: boolean;
  /**
   * The models behind these numbers.
   *
   * Not decoration: a cost that moved and a model someone changed look
   * identical in the table above. This is what tells them apart — and it is the
   * form's source of truth, so the screen never shows a value the server isn't
   * actually using.
   */
  settings: AiSettingsDto;
  monthStart: string;
  tenants: AdminAiTenantDto[];
  models: AdminAiModelDto[];
  totals: {
    generations: number;
    succeeded: number;
    failed: number;
    repaired: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    costMicroUsd: number | null;
    reportedCostMicroUsd: number | null;
    unpricedGenerations: number;
    clinicsAtLimit: number;
  };
};

/**
 * Share of input tokens served from the provider's prompt cache, 0–1, or `null`
 * when no input tokens were recorded at all.
 *
 * This is the number the whole base-only catalog design exists to move: the
 * prefix is byte-identical across clinics precisely so this sits near 1. A
 * ratio that stays low means the prefix is changing between calls — the design
 * is not working and nothing else would say so.
 */
export function cacheHitRatio(
  inputTokens: number,
  cachedInputTokens: number,
): number | null {
  const total = inputTokens + cachedInputTokens;
  return total === 0 ? null : cachedInputTokens / total;
}

/** "87%" — or "—" when there is nothing to divide. */
export function formatCacheHitRatio(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

/**
 * Where a cost figure came from — measured by the provider, estimated from the
 * price list, or a mix of both.
 *
 * Worth surfacing rather than hiding behind one number: an estimate is only as
 * good as the price someone typed, while a measured figure is what the invoice
 * will say. An admin comparing two models needs to know which kind they are
 * looking at before drawing a conclusion from a 10% difference.
 */
export type CostBasis = "measured" | "mixed" | "estimated" | "none";

export function costBasis(
  costMicroUsd: number | null,
  reportedCostMicroUsd: number | null,
): CostBasis {
  if (costMicroUsd === null) return "none";
  if (reportedCostMicroUsd === null) return "estimated";
  // Equal means every costed row carried its own reported figure; anything less
  // means the price list filled the rest in.
  return reportedCostMicroUsd >= costMicroUsd ? "measured" : "mixed";
}

/** PT-BR label for {@link costBasis}. `null` where there is nothing to qualify. */
export function formatCostBasis(basis: CostBasis): string | null {
  switch (basis) {
    case "measured":
      return "medido";
    case "mixed":
      return "medido + estimado";
    case "estimated":
      return "estimado";
    case "none":
      return null;
  }
}

/** "12.345" — thousands separated, for the token columns. */
export function formatTokens(n: number): string {
  return n.toLocaleString("pt-BR");
}
