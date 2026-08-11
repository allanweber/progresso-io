/**
 * DTOs for the **aluno-facing** portal (`/student`). The aluno only ever reads
 * their **own** data, and only what has been **published** — never a draft. The
 * `studentId` is resolved from the session in the DAL, so the aluno never
 * supplies an id (see `src/server/dal/student-portal.ts`).
 */

import type { FeedbackFrequency, Weekday } from "@/db/schema";
import type {
  StudentDietHistoryDto,
  StudentDietPublishedDto,
} from "@/lib/student-diets";
import type {
  StudentWorkoutHistoryDto,
  StudentWorkoutPublishedDto,
} from "@/lib/student-workouts";

/** The aluno's header/sidebar identity, shown on every tab of the portal. */
export type AlunoProfileDto = {
  /** Full name of the student ("Mariana Alves"). */
  name: string;
  /** First name, for the mobile greeting ("Oi, Mariana!"). */
  firstName: string;
  /** The assigned coach's name, or null if none is assigned. */
  coachName: string | null;
  /** The clinic (tenant) the aluno belongs to. */
  clinicName: string;
  /** The training goal (objetivo), or null if unset — the badge is hidden then. */
  goal: string | null;
  /** The clinic's check-in cadence (set by the coach in Configurações). */
  feedbackFrequency: FeedbackFrequency;
  /** The clinic's preferred check-in weekday. */
  feedbackPreferredDay: Weekday;
};

/**
 * Everything the Dieta tab needs, from the aluno's side: the active published
 * diet (or null if the coach hasn't published one yet) and the read-only
 * history. There is deliberately **no** `draft` field — drafts are invisible to
 * the aluno and are never loaded by the portal DAL.
 */
export type MyDietStateDto = {
  current: StudentDietPublishedDto | null;
  history: StudentDietHistoryDto[];
};

/**
 * Everything the Treino tab needs, from the aluno's side: the active published
 * workout (or null if the coach hasn't published one yet) and the read-only
 * history. Like the diet state, there is deliberately **no** `draft` field.
 */
export type MyWorkoutStateDto = {
  current: StudentWorkoutPublishedDto | null;
  history: StudentWorkoutHistoryDto[];
};
