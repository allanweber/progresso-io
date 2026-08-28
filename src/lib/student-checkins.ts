import type { CheckinAuthor, CheckinPose } from "@/db/schema";
import {
  assessmentSchema,
  type CheckinAssessmentDto,
  type CheckinCircumferences,
  type CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import { todayYmd } from "@/lib/calendar";
import { brToIso, isoToBr } from "@/lib/date-br";
import { z } from "@/lib/validation";

/**
 * Client-safe check-in domain: the four poses (values, labels and the "como
 * tirar as fotos" instructions from the design), the zod schema for the text
 * fields of a submission (weight + note — the four photos are validated as
 * files in the route), and the DTOs the portal reads. Only erased `import
 * type`s from the schema, so this bundles into client code.
 */

export const CHECKIN_POSE_VALUES = [
  "frente",
  "costas",
  "lado_esquerdo",
  "lado_direito",
] as const satisfies readonly CheckinPose[];

/** How many poses a complete student check-in must carry (all four). */
export const CHECKIN_POSE_COUNT = CHECKIN_POSE_VALUES.length;

/** Slot titles, as shown on each upload card in the design. */
export const CHECKIN_POSE_LABELS: Record<CheckinPose, string> = {
  frente: "Pose de frente",
  costas: "Pose de costas",
  lado_esquerdo: "Pose lado esquerdo",
  lado_direito: "Pose lado direito",
};

/** The "Como tirar as fotos" guidance, one line per pose (from the mockup). */
export const CHECKIN_POSE_INSTRUCTIONS: Record<CheckinPose, string> = {
  frente: "De pé, corpo relaxado e braços ao lado do corpo.",
  costas: "Mesma posição, de costas para a câmera.",
  lado_esquerdo: "De lado, braço direito estendido reto à frente.",
  lado_direito:
    "De lado, braço direito estendido à frente e flexionando o bíceps.",
};

/**
 * Body weight in kg: required for an aluno submission. Comes in as a string (the
 * form field / the multipart value), normalizes a comma decimal to a dot, checks
 * a sane 20–400 kg range, and rounds to one decimal. String in → number out, so
 * it drives the TanStack Form field directly.
 */
const weightKgSchema = z
  .string({ error: "Informe seu peso." })
  .trim()
  .min(1, "Informe seu peso.")
  .transform((v) => Number(v.replace(",", ".")))
  .refine((n) => Number.isFinite(n), "Informe um peso válido.")
  .refine((n) => n >= 20 && n <= 400, "Peso deve estar entre 20 e 400 kg.")
  .transform((n) => Math.round(n * 10) / 10);

/**
 * "Como foi a semana?" — optional free text; blank becomes null. Callers pass a
 * string (the route coerces a missing field to ""), so string in → string|null
 * out keeps the form field typing clean.
 */
const noteSchema = z
  .string()
  .trim()
  .max(2000, "Observação muito longa (máx. 2000 caracteres).")
  .transform((v) => (v === "" ? null : v));

/**
 * The text fields of a check-in submission. The four required photos are
 * validated as files in the route (see /api/student/checkin), not here.
 */
export const checkinSubmitSchema = z.object({
  weightKg: weightKgSchema,
  note: noteSchema,
});

export type CheckinSubmitInput = z.input<typeof checkinSubmitSchema>;
export type CheckinSubmitValues = z.output<typeof checkinSubmitSchema>;

/**
 * Coach-side weight: OPTIONAL (a coach entry may be a note-only annotation).
 * String in → number|null out, same normalization/range as the student weight.
 */
const optionalWeightSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .refine(
    (n) => n === null || (Number.isFinite(n) && n >= 20 && n <= 400),
    "Peso deve estar entre 20 e 400 kg.",
  )
  .transform((n) => (n === null ? null : Math.round(n * 10) / 10));

/**
 * The floor for a backdated check-in — a typo guard (a mistyped year lands
 * decades away), not a product rule.
 */
export const CHECKIN_MIN_DATE = "2015-01-01";

/**
 * The date of a coach check-in, canonical `yyyy-mm-dd` (the UI types it as
 * `dd/mm/aaaa` — see `@/lib/date-br`). A coach may backdate freely so past
 * check-ins can be imported, but never forward: a future date would become the
 * student's most recent check-in and push their next one out (the agenda and the
 * WhatsApp reminder both derive from `MAX(date)`).
 */
export const checkinDateSchema = z
  .string({ error: "Informe a data do check-in." })
  .trim()
  .min(1, "Informe a data do check-in.")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato dd/mm/aaaa.")
  // Round-trip through the BR helpers so 31/02 is rejected rather than rolled.
  .refine((v) => brToIso(isoToBr(v)) === v, "Data inválida.")
  .refine(
    (v) => v >= CHECKIN_MIN_DATE,
    `Data muito antiga (a partir de ${isoToBr(CHECKIN_MIN_DATE)}).`,
  )
  // `todayYmd()` is anchored to America/São_Paulo, not the server's or the
  // device's zone — so "hoje" means the same day for a coach in Recife, a
  // container running UTC, and a browser set to Tokyo.
  .refine((v) => v <= todayYmd(), "A data não pode ser futura.");

/**
 * The text fields of a coach MANUAL check-in (multipart). Photos (0–4, optional)
 * are validated as files in the route; the optional assessment rides as a JSON
 * field parsed with {@link assessmentSchema}. Weight + note are both optional —
 * the route rejects a check-in that carries nothing at all. The date defaults to
 * today in the form but is backdatable (see {@link checkinDateSchema}).
 */
export const coachCheckinSchema = z.object({
  date: checkinDateSchema,
  weightKg: optionalWeightSchema,
  note: noteSchema,
});

export type CoachCheckinInput = z.input<typeof coachCheckinSchema>;

/**
 * The coach's feedback on a student check-in (JSON). Feedback text is required —
 * responding IS the review action — with an OPTIONAL body assessment alongside.
 */
export const coachFeedbackSchema = z.object({
  feedback: z
    .string({ error: "Escreva um feedback." })
    .trim()
    .min(1, "Escreva um feedback.")
    .max(4000, "Feedback muito longo (máx. 4000 caracteres)."),
  assessment: assessmentSchema.optional(),
});

export type CoachFeedbackInput = z.input<typeof coachFeedbackSchema>;

/* -------------------------------------------------------------------------- */
/*  Display helpers (client-safe)                                             */
/* -------------------------------------------------------------------------- */

/** "71,4" — one decimal, comma separator (pt-BR). */
export function formatCheckinWeight(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** "11/08/2026" from a `YYYY-MM-DD` string, timezone-safe (no Date parsing). */
export function formatCheckinDate(d: string): string {
  return isoToBr(d);
}

/** "11/08" short date for a chart axis, from a `YYYY-MM-DD` string. */
export function shortCheckinDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** One entry on the timeline (Evolução → "Histórico de check-ins" / Feedback). */
export type CheckinDto = {
  id: string;
  /** Calendar date, `YYYY-MM-DD`. */
  date: string;
  author: CheckinAuthor;
  weightKg: number | null;
  note: string | null;
  /** How many photos this entry carries. */
  photoCount: number;
  /** The coach's response text (null until reviewed / for coach entries). */
  feedback: string | null;
  /** When the coach responded (ISO); null = a student entry still pending. */
  feedbackAt: string | null;
  /** Whether a body assessment (measures) is attached. */
  hasAssessment: boolean;
  /** Row creation instant (ISO) — tiebreaker for same-date entries. */
  createdAt: string;
};

/**
 * A student check-in awaiting the coach: student-authored with no feedback yet.
 * The single source of truth for the "aguarda resposta" state (no status
 * column), shared by the coach queue, the badges and the student's view.
 */
export function isCheckinPending(c: {
  author: CheckinAuthor;
  feedbackAt: string | null;
}): boolean {
  return c.author === "student" && c.feedbackAt === null;
}

/** A single weight reading for the evolution chart. */
export type WeightPointDto = { date: string; weightKg: number };

/** What GET /api/student/checkin returns: the timeline + the weight series. */
export type CheckinListDto = {
  /** Newest first. Includes coach annotations, marked by `author`. */
  checkins: CheckinDto[];
  /** Only entries that carry a weight, oldest → newest (for the chart). */
  weightSeries: WeightPointDto[];
};

/** One stored photo of a check-in (the id resolves to its bytes via the route). */
export type CheckinPhotoDto = { id: string; pose: CheckinPose };

/**
 * The diet or workout that was the plan of record on a check-in's date — the
 * version published on or before it, captured when the check-in was written.
 *
 * `versionId` is null when that plan has since been deleted; `name`/`version`
 * were copied at capture time, so the label still reads (as dead text, with no
 * link to open). A check-in from before the student had any published plan
 * carries no ref at all.
 */
export type CheckinPlanRefDto = {
  versionId: string | null;
  name: string;
  version: number;
};

/**
 * A single check-in's full detail, for the modal opened from the history — adds
 * the photos. Their bytes are streamed, owner-scoped, from
 * `/api/student/checkin/<id>/photo/<photoId>`.
 */
export type CheckinDetailDto = {
  id: string;
  date: string;
  author: CheckinAuthor;
  weightKg: number | null;
  note: string | null;
  /** The coach's response (null while pending / for coach entries). */
  feedback: string | null;
  feedbackAt: string | null;
  photos: CheckinPhotoDto[];
  /** The captured body assessment, if any. */
  assessment: CheckinAssessmentDto | null;
  /** The diet the student was following on this date (null if none). */
  diet: CheckinPlanRefDto | null;
  /** The workout the student was following on this date (null if none). */
  workout: CheckinPlanRefDto | null;
};

/* -------------------------------------------------------------------------- */
/*  Evolução (coach + student)                                                */
/* -------------------------------------------------------------------------- */

/** One assessment reading on the measures-over-time timeline (oldest→newest). */
export type AssessmentPointDto = {
  checkinId: string;
  date: string;
  circumferences: CheckinCircumferences;
  skinfolds: CheckinSkinfolds;
  bodyFatPct: number | null;
};

/** A check-in that carries photos — for the comparable before/after photos. */
export type PhotoSetDto = {
  checkinId: string;
  date: string;
  weightKg: number | null;
  photos: CheckinPhotoDto[];
};

/** What GET /api/students/[id]/evolution returns (the coach Evolução tab). */
export type EvolutionDto = {
  /** Weight readings, oldest → newest. */
  weightSeries: WeightPointDto[];
  /** Assessments, oldest → newest (for the Medidas Δ table). */
  assessments: AssessmentPointDto[];
  /** Check-ins with photos, oldest → newest (for the comparison). */
  photoSets: PhotoSetDto[];
};
