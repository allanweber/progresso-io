import {
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseOrigin,
  type Muscle,
} from "@/lib/exercises";
import { z } from "@/lib/validation";
import {
  WORKOUT_TECHNIQUES,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";

/**
 * Client-safe workout domain: the DTOs the Treinos screens read and the zod
 * schemas the API validates with. A **workout** is a coach-authored, reusable
 * training-program template (the analogue of a `diet`); assigning one to a
 * student produces a versioned `student_workout` (see `lib/student-workouts`).
 *
 * Like the diet feature, nutrition/exercise presentation is **never stored** on
 * a workout: an item holds only the prescription (which exercise + sets/reps/
 * load/rest/technique) and the exercise's name, images, instructions, muscles
 * and library substitutes are hydrated live from the catalog on read. No
 * server/database import, so it bundles into the client pages.
 */

export type WorkoutOrigin = ExerciseOrigin; // "base" | "clinic"

export const WORKOUT_ORIGIN_LABELS: Record<WorkoutOrigin, string> = {
  base: "base",
  clinic: "próprio",
};

/**
 * Quick ficha-name suggestions, in the two groups a ficha name is actually made
 * of: its **position** in the week and its **focus**. The conventional name
 * pairs them — `Ficha A · Peito e Tríceps` — so the chips must **compose**, not
 * replace: picking a focus keeps the position the coach already chose, and vice
 * versa. They only prefill a free-text field; the coach can still type anything.
 */
export const SESSION_POSITION_SUGGESTIONS = [
  "Ficha A",
  "Ficha B",
  "Ficha C",
  "Ficha D",
] as const;

export const SESSION_FOCUS_SUGGESTIONS = [
  "Peito e Tríceps",
  "Costas e Bíceps",
  "Pernas",
  "Ombros",
  "Full body",
] as const;

/** The separator between a ficha's position and its focus. */
export const SESSION_NAME_SEPARATOR = " · ";

const isPositionSuggestion = (part: string) =>
  (SESSION_POSITION_SUGGESTIONS as readonly string[]).includes(part);

/**
 * Applies one suggestion chip to the current ficha name, replacing only the
 * half that chip owns. `composeSessionName("Ficha A", "Pernas", "focus")` gives
 * `Ficha A · Pernas`; clicking a second position chip swaps the position and
 * leaves the focus — including free text the coach typed themselves — intact.
 */
export function composeSessionName(
  current: string,
  suggestion: string,
  group: "position" | "focus",
): string {
  const parts = current
    .split(SESSION_NAME_SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  const position =
    group === "position" ? suggestion : parts.find(isPositionSuggestion);
  const rest = parts.filter((p) => !isPositionSuggestion(p));
  const focus =
    group === "focus"
      ? suggestion
      : rest.join(SESSION_NAME_SEPARATOR) || undefined;
  return [position, focus].filter(Boolean).join(SESSION_NAME_SEPARATOR);
}

/* -------------------------------------------------------------------------- */
/*  Reps — number | range | failure                                           */
/* -------------------------------------------------------------------------- */

/**
 * How an exercise's repetitions are prescribed:
 * - `fixed`    — a single number (e.g. 12);
 * - `range`    — a **sequence** of 2+ values, crescente or decrescente (e.g.
 *   `8-12`, or a pyramid like `10-8-6-4`);
 * - `pyramid`  — the same sequence, one value **per set**, with the load rising;
 * - `duration` — tempo em segundos por série instead of repetitions (prancha,
 *   isometria, cardio…);
 * - `failure`  — até a falha.
 */
export type WorkoutReps =
  | { kind: "fixed"; value: number }
  | { kind: "range"; values: number[] }
  | { kind: "pyramid"; values: number[] }
  | { kind: "duration"; seconds: number }
  | { kind: "failure" };

/** Default seconds for a freshly-picked `duration` prescription. */
export const DEFAULT_DURATION_SECONDS = 30;

/**
 * A pirâmide prescribes **one set per position**, so its séries are derived
 * from the sequence, never typed by hand: adding/removing a position moves the
 * set count with it. Every other kind keeps the coach's own `sets`.
 */
export function resolveSets(reps: WorkoutReps, sets: number): number {
  const r = normalizeReps(reps);
  return r.kind === "pyramid" ? r.values.length : sets;
}

/**
 * Coerces a stored/unknown reps value into the current `WorkoutReps` shape.
 * Tolerates the **legacy** range shape (`{ kind: "range", min, max }`, before
 * reps became a sequence) so workouts saved by an earlier version still read —
 * no data migration needed. Anything unrecognisable degrades to `Falha`.
 */
export function normalizeReps(reps: unknown): WorkoutReps {
  if (reps && typeof reps === "object") {
    const r = reps as Record<string, unknown>;
    if (r.kind === "fixed" && typeof r.value === "number") {
      return { kind: "fixed", value: r.value };
    }
    if (r.kind === "range" || r.kind === "pyramid") {
      const kind = r.kind;
      if (Array.isArray(r.values) && r.values.every((v) => typeof v === "number")) {
        const values = r.values as number[];
        if (values.length >= 1) return { kind, values };
      }
      // Legacy min/max pair → a two-position sequence.
      if (typeof r.min === "number" && typeof r.max === "number") {
        return { kind, values: [r.min, r.max] };
      }
    }
    if (r.kind === "duration" && typeof r.seconds === "number") {
      return { kind: "duration", seconds: r.seconds };
    }
    if (r.kind === "failure") return { kind: "failure" };
  }
  return { kind: "failure" };
}

/** Renders reps for display: `12` / `8-12` / `10-8-6-4` / `30s` / `Falha`. */
export function formatReps(reps: WorkoutReps): string {
  const r = normalizeReps(reps);
  switch (r.kind) {
    case "fixed":
      return String(r.value);
    case "range":
    case "pyramid":
      return r.values.join("-");
    case "duration":
      return formatSeconds(r.seconds);
    case "failure":
      return "Falha";
  }
}

/** The PT-BR header a reps value belongs under — `Reps`, or `Tempo` for a duração. */
export function repsLabel(reps: WorkoutReps): string {
  return normalizeReps(reps).kind === "duration" ? "Tempo" : "Reps";
}

/** Renders a number of seconds as `45s` / `2min` / `1:30`. */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}min` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Renders a rest time in seconds as `90s` / `1:30` / `—`. */
export function formatRest(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds === 0) return "sem descanso";
  return formatSeconds(seconds);
}

/* -------------------------------------------------------------------------- */
/*  Read DTOs (shared by the template detail and the student workout tree)     */
/* -------------------------------------------------------------------------- */

/**
 * A substitute offered for a workout exercise, hydrated for display. `source`
 * distinguishes the two kinds we merge on read:
 * - `library` — from the exercise catalog's `exercise_substitution` rules (live);
 * - `custom`  — cadastrado neste treino (stored on the item, with an optional note).
 */
export type WorkoutExerciseSubstituteDto = {
  exerciseId: string;
  name: string;
  code: string | null;
  origin: WorkoutOrigin;
  /** First image key; resolve with `exerciseImageUrl`. */
  thumbnail: string | null;
  /** All image keys, for the substitute's own detail view. */
  images: string[];
  /** Ordered execution steps (PT-BR), for the substitute's detail view. */
  instructions: string[];
  /** Primary muscles worked. */
  primaryMuscles: Muscle[];
  source: "library" | "custom";
  /** The coach's reason, for a custom substitute; null for library ones. */
  note: string | null;
};

/**
 * A hydrated exercise line in a workout. The catalog fields (name, images,
 * instructions, muscles, substitutes) are derived live on read; a ref whose
 * exercise is no longer visible becomes an `available: false` placeholder.
 */
export type WorkoutExerciseDto = {
  /** Row id (template) or a synthetic index id (student tree). */
  id: string;
  exerciseId: string;
  name: string;
  code: string | null;
  origin: WorkoutOrigin;
  category: ExerciseCategory | null;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  /** Image keys ("<code>/0.jpg"); resolve with `exerciseImageUrl`. */
  images: string[];
  /** Ordered execution steps (PT-BR). */
  instructions: string[];
  /** false when the referenced exercise is unavailable (hard-deleted). */
  available: boolean;
  sets: number;
  reps: WorkoutReps;
  load: string | null;
  /** Rest in seconds (0 = no rest, e.g. a super-set member). */
  rest: number;
  /** A short free-text observation for this exercise, or null. */
  note: string | null;
  technique: WorkoutTechnique | null;
  /** Shared by consecutive items forming a super-set / giant-set block. */
  groupId: string | null;
  /** Library (live) + custom substitutes, merged. */
  substitutes: WorkoutExerciseSubstituteDto[];
};

/** A session (ficha) within a workout — its ordered exercises. */
export type WorkoutSessionDto = {
  id: string;
  name: string;
  position: number;
  exercises: WorkoutExerciseDto[];
};

/** A full workout (template detail) or a hydrated student workout tree. */
export type WorkoutTreeDto = { sessions: WorkoutSessionDto[] };

/** A row in the Treinos (programas) listing. */
export type WorkoutListItemDto = {
  id: string;
  name: string;
  origin: WorkoutOrigin;
  archived: boolean;
  sessionCount: number;
  exerciseCount: number;
  /** ISO timestamp. */
  updatedAt: string;
};

export type WorkoutListResponse = {
  items: WorkoutListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** A template workout's detail page. */
export type WorkoutDetailDto = {
  id: string;
  name: string;
  notes: string | null;
  /** The cardio prescription for the whole program (free text), or null. */
  cardio: string | null;
  origin: WorkoutOrigin;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  sessions: WorkoutSessionDto[];
};

/** The subset of a created/updated workout the client needs (to navigate). */
export type WorkoutMutationResponse = { workout: { id: string } };

/* -------------------------------------------------------------------------- */
/*  Query + write schemas (zod — validated at the API before the DAL)          */
/* -------------------------------------------------------------------------- */

/** Query for the Treinos listing. All optional; validated before the DAL. */
export const workoutListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  includeArchived: z.boolean().optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type WorkoutListQuery = z.output<typeof workoutListQuerySchema>;

/**
 * Reps payload: `{kind:'fixed',value}` | `{kind:'range',values}` |
 * `{kind:'pyramid',values}` | `{kind:'duration',seconds}` | `{kind:'failure'}`.
 * A range and a pyramid are both a sequence of 2+ values (crescente or
 * decrescente), e.g. `[8,12]` or `[12,10,8,6]`; the pyramid additionally implies
 * one set per position with the load rising. A duração prescribes seconds per
 * set instead of repetitions.
 */
const repsSequenceSchema = z
  .array(
    z
      .number()
      .int("Informe números inteiros.")
      .min(1, "Mínimo de 1 repetição.")
      .max(1000, "Valor muito alto."),
  )
  .min(2, "Informe ao menos dois valores.")
  .max(10, "Valores demais.");

export const repsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fixed"),
    value: z
      .number()
      .int("Informe um número inteiro.")
      .min(1, "Mínimo de 1 repetição.")
      .max(1000, "Valor muito alto."),
  }),
  z.object({ kind: z.literal("range"), values: repsSequenceSchema }),
  z.object({ kind: z.literal("pyramid"), values: repsSequenceSchema }),
  z.object({
    kind: z.literal("duration"),
    seconds: z
      .number()
      .int("Informe segundos inteiros.")
      .min(1, "Mínimo de 1 segundo.")
      .max(3600, "Tempo muito longo."),
  }),
  z.object({ kind: z.literal("failure") }),
]);

/** A custom substitute cadastrado no treino: a catalog exercise + optional note. */
export const customSubstituteSchema = z.object({
  exerciseId: z.string().uuid("Exercício inválido."),
  note: z
    .string()
    .trim()
    .max(200, "Observação muito longa.")
    .nullish()
    .transform((v) => (v ? v : null)),
});

const exerciseBaseSchema = z.object({
  exerciseId: z.string().uuid("Exercício inválido."),
  sets: z
    .number()
    .int("Informe um número inteiro.")
    .min(1, "Mínimo de 1 série.")
    .max(50, "Séries demais."),
  reps: repsSchema,
  load: z
    .string()
    .trim()
    .max(40, "Carga muito longa.")
    .nullish()
    .transform((v) => (v ? v : null)),
  // Rest in seconds; defaults to 01:30. 0 is allowed (super-set members).
  rest: z
    .number()
    .int("Informe segundos inteiros.")
    .min(0, "Descanso inválido.")
    .max(3600, "Descanso muito longo.")
    .default(90),
  note: z
    .string()
    .trim()
    .max(280, "Observação muito longa.")
    .nullish()
    .transform((v) => (v ? v : null)),
  technique: z
    .enum(WORKOUT_TECHNIQUES, { error: "Técnica inválida." })
    .nullish()
    .transform((v) => (v ? v : null)),
  groupId: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
  customSubstitutes: z.array(customSubstituteSchema).max(20).default([]),
});

/**
 * Enforces the pirâmide invariant on every write, wherever the payload came
 * from (builder, AI, starter template): séries == número de posições.
 */
const exerciseInputSchema = exerciseBaseSchema.transform((x) => ({
  ...x,
  sets: resolveSets(x.reps, x.sets),
}));

const sessionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da ficha.")
    .max(80, "Nome muito longo."),
  exercises: z.array(exerciseInputSchema).max(100).default([]),
});

/**
 * The full workout write payload (the whole tree), shared by the template
 * create/edit routes and the student-workout draft/publish routes. `name` is
 * required; everything else may be empty so a coach can save an empty draft.
 * Its output matches the DAL's `WorkoutWriteInput`.
 */
export const workoutFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do treino.")
    .max(120, "Nome muito longo."),
  notes: z
    .string()
    .trim()
    .max(2000, "Observações muito longas.")
    .nullish()
    .transform((v) => (v ? v : null)),
  cardio: z
    .string()
    .trim()
    .max(2000, "Cardio muito longo.")
    .nullish()
    .transform((v) => (v ? v : null)),
  sessions: z.array(sessionSchema).max(30).default([]),
});

export type WorkoutFormInput = z.input<typeof workoutFormSchema>;
export type WorkoutFormValues = z.output<typeof workoutFormSchema>;
