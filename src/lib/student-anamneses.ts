import { z } from "@/lib/validation";
import {
  ANAMNESIS_QUESTION_TYPE_VALUES,
  type AnamnesisSection,
} from "@/lib/anamneses";

/**
 * Client-safe domain for a **student's** anamnese — the filled-in questionnaire
 * saved on a student's profile, distinct from the reusable clinic template
 * (`@/lib/anamneses`).
 *
 * When a template is assigned to a student we **snapshot** its sections/questions
 * onto the student's record and collect `answers` keyed by question key. The
 * snapshot is frozen: editing/deleting the template afterwards never mutates what
 * a student was asked or answered (the opposite of the diet/workout live model —
 * correct here, because a filled questionnaire must not change under the aluno).
 */

/* -------------------------------------------------------------------------- */
/*  Enums + labels                                                             */
/* -------------------------------------------------------------------------- */

/** Whether the student's anamnese has been filled yet. */
export const STUDENT_ANAMNESIS_STATUS_VALUES = ["pending", "completed"] as const;
export type StudentAnamnesisStatus =
  (typeof STUDENT_ANAMNESIS_STATUS_VALUES)[number];

/** Who filled it — the aluno (online, via the WhatsApp link) or the coach. */
export const ANAMNESIS_FILLED_BY_VALUES = ["aluno", "coach"] as const;
export type AnamnesisFilledBy = (typeof ANAMNESIS_FILLED_BY_VALUES)[number];

/* -------------------------------------------------------------------------- */
/*  Answers                                                                    */
/* -------------------------------------------------------------------------- */

/** A single answer value. Boolean questions store a bool; the rest store text. */
export type AnamnesisAnswerValue = string | boolean | null;

/** The `answers` jsonb: question key → answer value. */
export type AnamnesisAnswers = Record<string, AnamnesisAnswerValue>;

/* -------------------------------------------------------------------------- */
/*  Canonical metric keys (Perfil card)                                        */
/*                                                                            */
/*  The profile's "Perfil" card is extracted from anamnese answers via these   */
/*  well-known question keys, seeded into the starter templates. The card shows */
/*  ONLY the ones present & answered — a coach can rename/remove questions      */
/*  freely and the card just reflects whatever canonical keys survive.         */
/* -------------------------------------------------------------------------- */

export const PROFILE_METRIC_KEYS = [
  "idade",
  "altura",
  "peso_atual",
  "experiencia",
  "frequencia",
] as const;
export type ProfileMetricKey = (typeof PROFILE_METRIC_KEYS)[number];

export const PROFILE_METRIC_LABELS: Record<ProfileMetricKey, string> = {
  idade: "Idade",
  altura: "Altura",
  peso_atual: "Peso atual",
  experiencia: "Experiência",
  frequencia: "Frequência",
};

/**
 * The aluno's body weight in kg, from the canonical `peso_atual` answer.
 *
 * Body weight is the one anamnese figure that feeds *arithmetic* rather than
 * the model's judgement — "alta proteína" means 2,2 g per kg, and without the
 * kg it can only mean a share of the calories. Free text, so it arrives as
 * "82", "82,5" or "82 kg"; anything that is not a plausible human weight is
 * `null` rather than a guess, because a wrong weight is worse than none.
 */
export function bodyWeightKg(answers: AnamnesisAnswers): number | null {
  const raw = answers["peso_atual"];
  if (raw === null || raw === undefined || typeof raw === "boolean") return null;
  const match = String(raw).replace(",", ".").match(/\d+(\.\d+)?/);
  if (!match) return null;
  const kg = Number(match[0]);
  return Number.isFinite(kg) && kg >= 25 && kg <= 400 ? kg : null;
}

/** A resolved Perfil metric (label + display value) for the profile card. */
export type ProfileMetric = { key: ProfileMetricKey; label: string; value: string };

/**
 * Pulls the canonical Perfil metrics out of the snapshot's answers, in a stable
 * order, skipping any that are missing/blank. Booleans render as Sim/Não.
 */
export function extractProfileMetrics(
  answers: AnamnesisAnswers | null | undefined,
): ProfileMetric[] {
  if (!answers) return [];
  const out: ProfileMetric[] = [];
  for (const key of PROFILE_METRIC_KEYS) {
    const raw = answers[key];
    if (raw == null || raw === "") continue;
    const value =
      typeof raw === "boolean" ? (raw ? "Sim" : "Não") : String(raw).trim();
    if (!value) continue;
    out.push({ key, label: PROFILE_METRIC_LABELS[key], value });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  DTOs                                                                        */
/* -------------------------------------------------------------------------- */

/** The student's anamnese as the coach profile / fill pages read it. */
export type StudentAnamnesisDto = {
  id: string;
  studentId: string;
  sourceAnamnesisId: string | null;
  name: string;
  sections: AnamnesisSection[];
  answers: AnamnesisAnswers;
  status: StudentAnamnesisStatus;
  filledBy: AnamnesisFilledBy | null;
  filledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The public fill page's view: the questionnaire + who it's for, WITHOUT any
 * answers or tenant ids. `valid` is false when the token is unknown, expired or
 * already submitted.
 */
/**
 * What the public `GET /api/anamnesis/fill` returns — deliberately minimal and
 * free of the data subject's PII. It carries only what the confirm gate needs
 * to render (the clinic + the anamnese title, neither of which is personal
 * data). The student's name, the phone hint and the questionnaire itself are
 * NOT here: they're withheld until the WhatsApp number is confirmed and are
 * returned by the confirm endpoint ({@link FillRevealDto}). This way a leaked/
 * forwarded fill link can't disclose who the link is for.
 */
export type FillPageState =
  | { valid: false }
  | { valid: true; clinicName: string; name: string };

/**
 * Returned by `POST /api/anamnesis/fill/confirm` once the WhatsApp number
 * matches the one on file — the identity + questionnaire, revealed only after
 * the number is verified server-side.
 */
export type FillRevealDto = {
  studentAnamnesisId: string;
  studentFirstName: string;
  sections: AnamnesisSection[];
};

/* -------------------------------------------------------------------------- */
/*  Schemas                                                                     */
/* -------------------------------------------------------------------------- */

/** One answer: a bool, a string (trimmed, capped), or null/omitted. */
const answerValueSchema = z.union([
  z.boolean(),
  z
    .string()
    .max(5000, "Resposta muito longa.")
    .transform((v) => v.trim()),
  z.null(),
]);

/** The answers map. Keys must be non-empty; values are validated per above. */
export const anamnesisAnswersSchema = z.record(
  z.string().min(1).max(60),
  answerValueSchema,
);

/** Assigning / swapping a template onto a student: just the template id. */
export const assignAnamnesisSchema = z.object({
  anamnesisId: z.string().uuid("Selecione uma anamnese."),
});

/** Coach edits the saved answers in place (whole map replaces). */
export const editAnswersSchema = z.object({
  answers: anamnesisAnswersSchema.default({}),
});

/**
 * The public fill submit: the aluno confirms their WhatsApp number (the
 * credential) and sends the answers. The token travels in the URL/path, not the
 * body.
 */
export const fillSubmitSchema = z.object({
  phone: z.string().trim().min(1, "Confirme seu WhatsApp."),
  answers: anamnesisAnswersSchema.default({}),
});

export type AssignAnamnesisInput = z.output<typeof assignAnamnesisSchema>;
export type EditAnswersInput = z.output<typeof editAnswersSchema>;
export type FillSubmitInput = z.output<typeof fillSubmitSchema>;

/** True question types that expect a text (vs boolean) answer. */
export const TEXT_QUESTION_TYPES = ANAMNESIS_QUESTION_TYPE_VALUES.filter(
  (t) => t !== "boolean",
);
