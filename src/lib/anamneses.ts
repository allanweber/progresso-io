import { z } from "@/lib/validation";

/**
 * Client-safe anamnesis (anamnese) domain: the DTOs the Anamneses screens read
 * and the zod schemas the API validates with. No server/database import, so it
 * bundles into the client pages.
 *
 * An anamnese is a coach-authored intake questionnaire. It is **not** a shared
 * base template: every clinic gets its own copy of a starter set when it is
 * created (see the seed), and owns them outright (create / edit / delete). A
 * questionnaire is a flat tree of **sections** → **questions**, each question a
 * label plus a basic type (short text / long text / yes-no).
 */

/* -------------------------------------------------------------------------- */
/*  Enums + PT-BR labels                                                       */
/* -------------------------------------------------------------------------- */

export const ANAMNESIS_OBJECTIVE_VALUES = [
  "weight_loss",
  "hypertrophy",
  "health",
  "clinical",
  "womens_health",
] as const;
export type AnamnesisObjective = (typeof ANAMNESIS_OBJECTIVE_VALUES)[number];

export const ANAMNESIS_OBJECTIVE_LABELS: Record<AnamnesisObjective, string> = {
  weight_loss: "Emagrecimento",
  hypertrophy: "Hipertrofia",
  health: "Saúde",
  clinical: "Clínico",
  womens_health: "Saúde da mulher",
};

export const ANAMNESIS_MODALITY_VALUES = ["in_person", "online", "any"] as const;
export type AnamnesisModality = (typeof ANAMNESIS_MODALITY_VALUES)[number];

export const ANAMNESIS_MODALITY_LABELS: Record<AnamnesisModality, string> = {
  in_person: "Presencial",
  online: "Online",
  any: "Ambos",
};

export const ANAMNESIS_QUESTION_TYPE_VALUES = [
  "short_text",
  "long_text",
  "boolean",
] as const;
export type AnamnesisQuestionType = (typeof ANAMNESIS_QUESTION_TYPE_VALUES)[number];

export const ANAMNESIS_QUESTION_TYPE_LABELS: Record<AnamnesisQuestionType, string> = {
  short_text: "Texto curto",
  long_text: "Texto longo",
  boolean: "Sim / Não",
};

/* -------------------------------------------------------------------------- */
/*  Stored tree (jsonb) + DTOs                                                 */
/* -------------------------------------------------------------------------- */

/** A single question: a label plus a basic input type. */
export type AnamnesisQuestion = {
  key: string;
  type: AnamnesisQuestionType;
  label: string;
};

/** A group of questions shown under one heading. */
export type AnamnesisSection = {
  key: string;
  title: string;
  questions: AnamnesisQuestion[];
};

/** What the `anamnesis.sections` jsonb column stores — the whole questionnaire. */
export type AnamnesisSections = AnamnesisSection[];

export const EMPTY_SECTIONS: AnamnesisSections = [];

/** A row in the Anamneses listing. */
export type AnamnesisListItemDto = {
  id: string;
  name: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sectionCount: number;
  questionCount: number;
  /** ISO timestamp (JSON-serialized Date). */
  updatedAt: string;
};

export type AnamnesisListResponse = {
  items: AnamnesisListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type AnamnesisDetailDto = {
  id: string;
  name: string;
  description: string | null;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: AnamnesisSection[];
  createdAt: string;
  updatedAt: string;
};

/** The subset of a created/updated anamnese the client needs (to navigate). */
export type AnamnesisMutationResponse = { anamnesis: { id: string } };

/* -------------------------------------------------------------------------- */
/*  Query + write schemas                                                      */
/* -------------------------------------------------------------------------- */

/** Query for the Anamneses listing. All optional; validated before the DAL. */
export const anamnesisListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AnamnesisListQuery = z.output<typeof anamnesisListQuerySchema>;

/**
 * Optional free text: accepts a string, null or undefined from JSON, trims it,
 * and normalizes an empty value to null.
 */
function optionalText(max: number, tooLong: string) {
  return z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .max(max, tooLong)
      .transform((v) => (v === "" ? null : v)),
  );
}

const questionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  type: z.enum(ANAMNESIS_QUESTION_TYPE_VALUES),
  label: z
    .string()
    .trim()
    .min(1, "Informe a pergunta.")
    .max(300, "Pergunta muito longa."),
});

const sectionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  title: z
    .string()
    .trim()
    .min(1, "Informe o título da seção.")
    .max(120, "Título muito longo."),
  questions: z.array(questionSchema).max(50).default([]),
});

/**
 * The full anamnese write payload (the whole tree), shared by the create/edit
 * API routes. `name`, `objective` and `modality` are required; the rest may be
 * empty, so a coach can save a questionnaire with no sections yet. Its output
 * matches the DAL's `AnamnesisWriteInput`.
 */
export const anamnesisFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da anamnese.")
    .max(120, "Nome muito longo."),
  description: optionalText(500, "Descrição muito longa."),
  objective: z.enum(ANAMNESIS_OBJECTIVE_VALUES),
  modality: z.enum(ANAMNESIS_MODALITY_VALUES),
  sections: z.array(sectionSchema).max(30).default([]),
});

export type AnamnesisFormInput = z.input<typeof anamnesisFormSchema>;
export type AnamnesisFormValues = z.output<typeof anamnesisFormSchema>;

/* -------------------------------------------------------------------------- */
/*  Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Total number of questions across every section. */
export function countQuestions(sections: AnamnesisSection[]): number {
  return sections.reduce((n, s) => n + s.questions.length, 0);
}
