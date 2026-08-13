/**
 * Client-facing DTOs for the coach dashboard (`GET /api/coach/dashboard`). The
 * data-backed cards are typed here — active-student count, the "sem treino ou
 * dieta" list, and the "check-ins aguardando resposta" queue. The mockup's
 * remaining sections (weight alerts, WhatsApp inbox) have no backend yet and
 * render an "em breve" state, so they carry no payload.
 */

export type MissingPlanStudentDto = {
  id: string;
  firstName: string;
  lastName: string;
  goal: string | null;
  missingDiet: boolean;
  missingWorkout: boolean;
};

/** An aluno check-in still waiting on the coach's feedback. */
export type PendingCheckinDto = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  /** Check-in day, `YYYY-MM-DD`. */
  date: string;
  weightKg: number | null;
};

export type CoachDashboardDto = {
  activeCount: number;
  missingPlans: MissingPlanStudentDto[];
  pendingCheckins: PendingCheckinDto[];
};
