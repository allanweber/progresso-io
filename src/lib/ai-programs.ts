import { z } from "@/lib/validation";

/**
 * Client-safe contract for the AI program generator: the dialog's form shape,
 * its PT-BR option labels, and the response DTO.
 *
 * Kept free of server imports so it bundles into the client component that
 * renders the dialog.
 */

/** What equipment the aluno actually has. Drives which exercises make sense. */
export const AI_EQUIPMENT_VALUES = [
  "academia",
  "halteres",
  "elasticos",
  "peso_corporal",
] as const;
export type AiEquipment = (typeof AI_EQUIPMENT_VALUES)[number];

export const AI_EQUIPMENT_LABELS: Record<AiEquipment, string> = {
  academia: "Academia completa",
  halteres: "Halteres",
  elasticos: "Elásticos",
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
export const aiDietGenerateSchema = z.object({
  objective: objectiveField,
  restrictions: z.array(z.enum(AI_RESTRICTION_VALUES)),
  mealsPerDay: z
    .number()
    .int("Informe um número inteiro de refeições.")
    .min(2, "Mínimo de 2 refeições por dia.")
    .max(8, "Máximo de 8 refeições por dia."),
});

export type AiWorkoutGenerateInput = z.infer<typeof aiWorkoutGenerateSchema>;
export type AiDietGenerateInput = z.infer<typeof aiDietGenerateSchema>;
export type AiGenerateInput = AiWorkoutGenerateInput | AiDietGenerateInput;

/** What the dialogs open with, so the coach confirms rather than types. */
export const AI_DEFAULT_DAYS_PER_WEEK = 3;
export const AI_DEFAULT_MEALS_PER_DAY = 5;

/** What the generate endpoints return on success. */
export type AiGenerateResultDto = {
  /** Credits used / allowed this month, after this generation. */
  used: number;
  limit: number | null;
  /** Whether the model's first answer had to be repaired (free to the coach). */
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
  outputTokens: number;
  /** Priced against `provider_price` at read time. `null` = nothing priceable. */
  costMicroUsd: number | null;
  /** Generations whose model had no price in force when they ran. */
  unpricedGenerations: number;
};

export type AdminAiOverviewDto = {
  /** Whether an LLM is configured at all — an empty table means two things. */
  configured: boolean;
  monthStart: string;
  tenants: AdminAiTenantDto[];
  totals: {
    generations: number;
    succeeded: number;
    failed: number;
    repaired: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    costMicroUsd: number | null;
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

/** "12.345" — thousands separated, for the token columns. */
export function formatTokens(n: number): string {
  return n.toLocaleString("pt-BR");
}
