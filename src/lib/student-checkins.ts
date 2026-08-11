import type { CheckinAuthor, CheckinPose } from "@/db/schema";
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

/** One entry on the student's timeline (Evolução → "Histórico de check-ins"). */
export type CheckinDto = {
  id: string;
  /** Calendar date, `YYYY-MM-DD`. */
  date: string;
  author: CheckinAuthor;
  weightKg: number | null;
  note: string | null;
  /** How many photos this entry carries (photos themselves aren't served yet). */
  photoCount: number;
  /** Row creation instant (ISO) — tiebreaker for same-date entries. */
  createdAt: string;
};

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
  photos: CheckinPhotoDto[];
};
