import type {
  BodyFatSource,
  EvaluationConfidence,
  EvaluationStatus,
  EvaluationVerdict,
} from "@/db/schema";
import { BODY_FAT_MAX, BODY_FAT_MIN } from "@/lib/body-composition";
import { z } from "@/lib/validation";

/**
 * Client-safe domain for the AI check-in evaluation: the payload the model
 * answers with, the DTO the coach's screen reads, the PT-BR labels, and the
 * schema the accept route validates. Only erased `import type`s cross in, so
 * this bundles into client code.
 *
 * The feature: on one check-in, the coach asks the model to read the weight,
 * the measures, the note and the photos against the aluno's goal and anamnese,
 * and answer with a body composition read plus advice. The advice is addressed
 * **to the coach** — it is not, and must never become, the text the aluno
 * receives. See docs/ai-evaluation.md.
 */

/* -------------------------------------------------------------------------- */
/*  The model's answer                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the model returns. Deliberately small: five strings, an enum and a
 * nullable number.
 *
 * **`bodyFatPct` may be null, and that is a feature.** Photos arrive clothed,
 * dark, cropped and in hoodies; a confident 18% read off a winter coat is the
 * worst thing this feature could produce, because the coach may write it into
 * a client's record. The model is told it may decline and say why, which is the
 * same instinct as `src/server/ai/salvage.ts` — an honest failure beats a
 * fabricated success.
 *
 * **No numeric directives.** The advice is prose, not "raise protein by 20 g":
 * numeric prescriptions are arithmetic, models get arithmetic wrong (the whole
 * reason `rebalance.ts` exists), and structuring them would imply a one-click
 * apply that would push AI-authored macros into a real aluno's diet.
 */
export type AiEvaluationPayload = {
  /** Visual estimate, or null when the photos cannot support one. */
  bodyFatPct: number | null;
  /** How sure the model is of that estimate. Null when it gave no number. */
  confidence: EvaluationConfidence | null;
  /** Short PT-BR reason, present only when `bodyFatPct` is null. */
  unavailable: string | null;
  verdict: EvaluationVerdict;
  /** One line — the headline the note card leads with. */
  summary: string;
  /**
   * What changed since the previous check-in. Its own field rather than part of
   * `summary` precisely so it can come back empty on a first check-in, instead
   * of "since last time you…" prose about a last time that never happened.
   */
  evolution: string;
  /** Advice to the coach about the diet. */
  diet: string;
  /** Advice to the coach about the training. */
  workout: string;
};

/* -------------------------------------------------------------------------- */
/*  Labels                                                                    */
/* -------------------------------------------------------------------------- */

export const EVALUATION_VERDICT_LABELS: Record<EvaluationVerdict, string> = {
  manter: "Manter",
  ajustar: "Ajustar",
  reavaliar: "Reavaliar",
};

/** One line each, so the badge can explain itself without a tooltip. */
export const EVALUATION_VERDICT_HINTS: Record<EvaluationVerdict, string> = {
  manter: "O programa está funcionando — seguir como está.",
  ajustar: "Vale mexer na dieta ou no treino.",
  reavaliar: "Algo não fecha — revisar de perto antes de mudar.",
};

export const EVALUATION_CONFIDENCE_LABELS: Record<EvaluationConfidence, string> =
  {
    baixa: "confiança baixa",
    media: "confiança média",
    alta: "confiança alta",
  };

export const BODY_FAT_SOURCE_LABELS: Record<BodyFatSource, string> = {
  skinfolds: "dobras cutâneas (7 dobras)",
  estimate: "estimativa visual",
  manual: "informado pelo coach",
};

/**
 * The chip shown next to the percentage. A caliper reading and a look at four
 * photos must never render identically — the coach has to be able to tell, at
 * a glance, which of the two they are about to save.
 */
export function bodyFatSourceLabel(
  source: BodyFatSource | null,
  confidence: EvaluationConfidence | null,
): string | null {
  if (source === null) return null;
  if (source === "estimate" && confidence) {
    return `${BODY_FAT_SOURCE_LABELS.estimate} (${EVALUATION_CONFIDENCE_LABELS[confidence]})`;
  }
  return BODY_FAT_SOURCE_LABELS[source];
}

/* -------------------------------------------------------------------------- */
/*  Refusals                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Why an evaluation could not run. The first four mirror the program
 * generator's; `no_checkin_data` is this feature's own.
 *
 * **Sparse data is never a refusal.** An online aluno with a weight and one
 * photo and nothing else is the normal case, not an error — the advice is the
 * product, and withholding it because nobody owns calipers would be exactly
 * backwards. Only a check-in with *nothing* on it is refused, because charging
 * a credit for a model call over an empty prompt is indefensible.
 */
export const EVALUATION_REFUSAL_CODES = [
  "not_configured",
  "no_anamnesis",
  "quota_exceeded",
  "already_running",
  "no_checkin_data",
] as const;
export type EvaluationRefusalCode = (typeof EVALUATION_REFUSAL_CODES)[number];

export const EVALUATION_REFUSAL_MESSAGES: Record<
  EvaluationRefusalCode,
  string
> = {
  not_configured: "A avaliação por IA ainda não está configurada nesta instalação.",
  no_anamnesis:
    "Este aluno precisa de uma anamnese preenchida antes de avaliar o check-in.",
  quota_exceeded:
    "Você já usou todas as gerações de IA deste mês. O limite renova no dia 1º.",
  already_running: "Já existe uma avaliação em andamento para este aluno.",
  no_checkin_data:
    "Este check-in não tem peso, medidas, fotos nem observação — não há o que avaliar.",
};

/* -------------------------------------------------------------------------- */
/*  DTOs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One draft evaluation as the coach's screen reads it: the model's words, plus
 * the numbers **as the server settled them**.
 *
 * `bodyFatPct` here is not necessarily `payload.bodyFatPct` — when the seven
 * folds were measured the server computed it and the model's guess was
 * discarded. The masses are derived, never stored: one source of truth for the
 * percentage means the pair can never drift apart.
 */
export type AiEvaluationDto = {
  id: string;
  checkinId: string;
  status: EvaluationStatus;
  payload: AiEvaluationPayload;
  bodyFatPct: number | null;
  bodyFatSource: BodyFatSource | null;
  confidence: EvaluationConfidence | null;
  leanMassPct: number | null;
  leanMassKg: number | null;
  fatMassKg: number | null;
  /** The check-in weight the masses were derived from, for the UI to restate. */
  weightKg: number | null;
  createdAt: string;
};

/** What the coach spends when they press the button. */
export type AiEvaluationRunDto = {
  evaluation: AiEvaluationDto;
  used: number;
  limit: number | null;
};

/* -------------------------------------------------------------------------- */
/*  Run request                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What the coach may send along when they press "Avaliar com IA": a free-text
 * steer for THIS run only — "focar na evolução da cintura", "aluno relatou dor
 * no ombro, considerar no treino". Optional, and blank becomes `null` so the
 * prompt can skip the line entirely rather than render an empty instruction.
 *
 * Kept separate from `student_note` on purpose: this is a one-off ask about
 * this evaluation, not a fact about the aluno worth keeping after it runs.
 */
export const evaluationRequestSchema = z.object({
  instructions: z
    .string()
    .trim()
    .max(500, "Instruções muito longas.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});
export type EvaluationRequestInput = z.infer<typeof evaluationRequestSchema>;

/* -------------------------------------------------------------------------- */
/*  Accept                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the coach sends when they accept — the values as they edited them, not
 * as the model wrote them.
 *
 * Body fat and massa magra are **coupled in the UI** (editing either recomputes
 * the other), so only the percentage travels: sending both would create a way
 * for a client to save 22% fat next to 82% lean, which is nonsense on its face
 * and impossible to render honestly afterwards.
 */
export const evaluationAcceptSchema = z.object({
  bodyFatPct: z
    .number()
    .min(BODY_FAT_MIN, `A % de gordura deve ser ao menos ${BODY_FAT_MIN}.`)
    .max(BODY_FAT_MAX, `A % de gordura deve ser no máximo ${BODY_FAT_MAX}.`)
    .nullable(),
  /** The note body, as edited. Blank is rejected — an empty note is not a note. */
  body: z
    .string()
    .trim()
    .min(1, "Escreva a nota antes de salvar.")
    .max(5000, "A nota é longa demais."),
});
export type EvaluationAcceptInput = z.infer<typeof evaluationAcceptSchema>;

/**
 * Renders the model's blocks as the note body the coach starts from. They can
 * rewrite every word of it before accepting — at which point it becomes their
 * note, which is the right relationship to an AI suggestion.
 */
export function defaultNoteBody(payload: AiEvaluationPayload): string {
  const parts = [payload.summary.trim()];
  if (payload.evolution.trim()) {
    parts.push(`Evolução: ${payload.evolution.trim()}`);
  }
  if (payload.diet.trim()) parts.push(`Dieta: ${payload.diet.trim()}`);
  if (payload.workout.trim()) parts.push(`Treino: ${payload.workout.trim()}`);
  return parts.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/*  Settling the numbers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The number the coach is actually shown, and where it came from.
 *
 * Three cases, in priority order, and the priority is the whole design:
 * calipers beat a photograph, a photograph beats nothing, and nothing is an
 * honest answer rather than a hole to be filled by the model's best guess.
 */
export function settleBodyFat(
  computed: number | null,
  answer: AiEvaluationPayload,
): {
  bodyFatPct: number | null;
  bodyFatSource: BodyFatSource | null;
  confidence: EvaluationConfidence | null;
} {
  if (computed !== null) {
    // Confidence is null here on purpose: it describes how sure the model is of
    // something it looked at, and it did not produce this number.
    return { bodyFatPct: computed, bodyFatSource: "skinfolds", confidence: null };
  }
  if (answer.bodyFatPct !== null) {
    return {
      bodyFatPct: answer.bodyFatPct,
      bodyFatSource: "estimate",
      // A model that gives a number without a confidence has not told us how
      // much to trust it, which is the same as telling us "not much".
      confidence: answer.confidence ?? "baixa",
    };
  }
  return { bodyFatPct: null, bodyFatSource: null, confidence: null };
}

/**
 * The model's answer, normalized into what gets stored.
 *
 * When the server computed the percentage, the model was told to answer `null` —
 * but a model that ignores that instruction must not leave a stale guess in the
 * payload next to a number the system did not use.
 */
export function normalizePayload(
  answer: AiEvaluationPayload,
  computed: number | null,
): AiEvaluationPayload {
  return {
    ...answer,
    bodyFatPct: computed !== null ? null : answer.bodyFatPct,
    confidence: computed !== null ? null : answer.confidence,
    unavailable: computed !== null ? null : answer.unavailable,
  };
}
