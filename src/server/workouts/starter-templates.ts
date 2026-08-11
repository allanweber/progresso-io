import type { WorkoutReps } from "@/lib/workouts";
import type { WorkoutTechnique } from "@/lib/workout-techniques";
import type { ExerciseSlug } from "@/server/starters/vocab";

import abcHipertrofia from "../../../drizzle/data/workouts/abc-hipertrofia.json";
import adaptacaoFullBody from "../../../drizzle/data/workouts/adaptacao-full-body.json";
import broSplit5x from "../../../drizzle/data/workouts/bro-split-5x.json";
import especializacaoBracoOmbro from "../../../drizzle/data/workouts/especializacao-braco-ombro.json";
import forca5x5 from "../../../drizzle/data/workouts/forca-5x5.json";
import fullBodyIniciante from "../../../drizzle/data/workouts/full-body-iniciante-ab.json";
import gluteosPernas from "../../../drizzle/data/workouts/gluteos-pernas.json";
import metabolicoHiit from "../../../drizzle/data/workouts/metabolico-hiit.json";
import pushPullLegs from "../../../drizzle/data/workouts/push-pull-legs.json";
import treinoEmCasa from "../../../drizzle/data/workouts/treino-em-casa.json";
import upperLower4x from "../../../drizzle/data/workouts/upper-lower-4x.json";

/**
 * The curated starter set of workout templates. Each
 * `drizzle/data/workouts/*.json` file is the single source of truth for one
 * starter, referencing base exercises by the stable slugs in
 * `@/server/starters/vocab` (an `exercise` UUID differs per database). A clinic
 * gets a clinic-owned **copy** of each on seed (`seedClinicWorkouts`) and edits
 * them freely afterwards.
 */
export type StarterWorkoutSubstitute = { exercise: ExerciseSlug; note?: string | null };

export type StarterWorkoutExercise = {
  exercise: ExerciseSlug;
  sets: number;
  reps: WorkoutReps;
  load?: string | null;
  rest?: number;
  note?: string | null;
  technique?: WorkoutTechnique | null;
  /** Shared by consecutive super-/giant-set members. */
  groupId?: string | null;
  substitutes?: StarterWorkoutSubstitute[];
};

export type StarterWorkoutSession = {
  name: string;
  exercises: StarterWorkoutExercise[];
};

export type StarterWorkout = {
  key: string;
  name: string;
  /** Informational level tag (not a stored column). */
  level: string;
  notes: string | null;
  sessions: StarterWorkoutSession[];
};

export const STARTER_WORKOUTS: StarterWorkout[] = [
  fullBodyIniciante,
  adaptacaoFullBody,
  upperLower4x,
  pushPullLegs,
  abcHipertrofia,
  broSplit5x,
  gluteosPernas,
  treinoEmCasa,
  metabolicoHiit,
  forca5x5,
  especializacaoBracoOmbro,
] as unknown as StarterWorkout[];
