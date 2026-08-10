/**
 * Client-facing DTOs for the coach dashboard (`GET /api/coach/dashboard`). Only
 * the data-backed cards are typed here — active-student count and the "sem treino
 * ou dieta" list. The mockup's other sections (check-ins, weight alerts,
 * calendar, WhatsApp inbox) have no backend yet and render an "em breve" state,
 * so they carry no payload.
 */

export type MissingPlanStudentDto = {
  id: string;
  firstName: string;
  lastName: string;
  goal: string | null;
  missingDiet: boolean;
  missingWorkout: boolean;
};

export type CoachDashboardDto = {
  activeCount: number;
  missingPlans: MissingPlanStudentDto[];
};
