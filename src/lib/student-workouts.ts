import { z } from "@/lib/validation";
import { type WorkoutReps, type WorkoutSessionDto } from "@/lib/workouts";
import { type WorkoutTechnique } from "@/lib/workout-techniques";

/**
 * Client-safe domain for a student's workout (treino do aluno). Unlike the
 * reusable template `workout`, a student's workout is **versioned**: a coach
 * builds a draft (invisible to the aluno) and **publishes** it, numbering a new
 * version each time.
 *
 * Following the diet model, a version stores only the **prescription structure**
 * (`WorkoutStructure`) — references, not a snapshot: which exercise + sets/reps/
 * load/rest/technique/grouping, plus any per-item custom substitutes. On every
 * read the DAL hydrates it against the current catalog (`hydrateStructure`), so
 * a coach's catalog correction (an exercise's images, instructions, or library
 * substitutes) reaches every student with no re-publish. The hydrated result is
 * a `WorkoutSessionDto[]` tree the read views render.
 *
 * Note the one deliberate difference from diets: a workout item **does** carry
 * per-item custom substitutes (cadastrados no treino), so the structure stores
 * them; library substitutes are still derived live on read.
 */

/* -------------------------------------------------------------------------- */
/*  Stored JSON structure (references only — presentation is derived live)     */
/* -------------------------------------------------------------------------- */

/** A custom substitute stored on a workout item: a catalog exercise + note. */
export type StructCustomSubstitute = {
  exerciseId: string;
  note: string | null;
};

/**
 * A stored exercise item — the **prescription** only: which exercise, how much
 * (sets/reps/load/rest), the optional advanced technique + grouping, and the
 * coach's custom substitutes. The exercise's name, images, instructions,
 * muscles and library substitutes are derived live from the catalog on read.
 */
export type StructExerciseRef = {
  exerciseId: string;
  sets: number;
  reps: WorkoutReps;
  load: string | null;
  rest: number;
  technique: WorkoutTechnique | null;
  groupId: string | null;
  customSubstitutes: StructCustomSubstitute[];
};

/** A stored session (ficha): name + its ordered item refs. */
export type StructSession = {
  name: string;
  items: StructExerciseRef[];
};

/**
 * What a version persists — the prescription structure: sessions of exercise
 * refs, nothing about presentation. The read tree (`WorkoutSessionDto[]`) is
 * produced by hydrating this against the current catalog in the DAL.
 */
export type WorkoutStructure = { sessions: StructSession[] };

/** An empty structure (a brand-new blank draft). */
export const EMPTY_STRUCTURE: WorkoutStructure = { sessions: [] };

/* -------------------------------------------------------------------------- */
/*  Read DTOs                                                                  */
/* -------------------------------------------------------------------------- */

/** The draft (unpublished) version currently in flight, if any. */
export type StudentWorkoutDraftDto = {
  workoutId: string;
  workoutName: string;
  versionId: string;
  /**
   * true when this draft is a **new** workout's first version — publishing it
   * archives the student's previous active workout. false when it's a new
   * version of the already-active workout.
   */
  isNewWorkout: boolean;
  notes: string | null;
  sessions: WorkoutSessionDto[];
};

/** The published version the aluno currently sees (latest of the active workout). */
export type StudentWorkoutPublishedDto = {
  workoutId: string;
  workoutName: string;
  version: number;
  /** ISO timestamp. */
  publishedAt: string;
  notes: string | null;
  sessions: WorkoutSessionDto[];
};

/** One published version in a workout's history. */
export type StudentWorkoutHistoryVersionDto = {
  versionId: string;
  version: number;
  /** ISO timestamp. */
  publishedAt: string;
};

/** A workout (active or archived) with its published versions, for the history. */
export type StudentWorkoutHistoryDto = {
  workoutId: string;
  workoutName: string;
  status: "active" | "archived";
  versions: StudentWorkoutHistoryVersionDto[];
};

/**
 * Everything the Treino tab needs in one read: the aluno-visible current
 * version, the in-flight draft (if any) and the full history. The tab picks its
 * state as: draft → builder; else current → read view; else → empty state.
 */
export type StudentWorkoutStateDto = {
  activeWorkoutId: string | null;
  current: StudentWorkoutPublishedDto | null;
  draft: StudentWorkoutDraftDto | null;
  history: StudentWorkoutHistoryDto[];
};

/** A single version's tree, for the read-only history view. */
export type StudentWorkoutVersionDto = {
  workoutId: string;
  workoutName: string;
  version: number;
  publishedAt: string;
  notes: string | null;
  sessions: WorkoutSessionDto[];
};

/* -------------------------------------------------------------------------- */
/*  Input schemas (zod — validated at the API before the DAL)                  */
/* -------------------------------------------------------------------------- */

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome do treino.")
  .max(120, "Nome muito longo.");

/**
 * Starting a draft for the student — one of three kinds:
 * - `blank`    — a brand-new empty workout (the coach names it);
 * - `template` — copy one of the coach's template workouts (optional new name);
 * - `edit`     — open a draft of the already-active workout (new version).
 */
export const studentWorkoutCreateActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank"), name: nameSchema }),
  z.object({
    kind: z.literal("template"),
    workoutId: z.string().uuid("Treino inválido."),
    name: nameSchema.optional(),
  }),
  z.object({ kind: z.literal("edit") }),
]);
export type StudentWorkoutCreateAction = z.infer<
  typeof studentWorkoutCreateActionSchema
>;

/** Exporting a student's workout version to the clinic's template catalog. */
export const saveWorkoutAsTemplateSchema = z.object({
  versionId: z.string().uuid("Versão inválida.").optional(),
});
