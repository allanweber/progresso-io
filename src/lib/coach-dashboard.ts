import type { CalendarItemDto } from "@/lib/calendar";

/**
 * Client-facing DTOs for the coach dashboard (`GET /api/coach/dashboard`). The
 * data-backed cards are typed here — active-student count, the "sem treino ou
 * dieta" list, the "check-ins aguardando resposta" queue, the "WhatsApp
 * aguardando" queue (conversations with unanswered inbound), and the calendar
 * "Hoje" / "Esta semana" agenda. The mockup's weight-alerts section has no
 * backend yet and renders an "em breve" state, so it carries no payload.
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

/** A WhatsApp conversation with unanswered inbound (awaiting a coach reply). */
export type WaWaitingDto = {
  conversationId: string;
  studentId: string | null;
  name: string;
  initials: string;
  preview: string | null;
};

export type CoachDashboardDto = {
  activeCount: number;
  missingPlans: MissingPlanStudentDto[];
  pendingCheckins: PendingCheckinDto[];
  waWaiting: WaWaitingDto[];
  /** Calendar items dated today, sorted by start time (timed first). */
  todayEvents: CalendarItemDto[];
  /** Calendar items from tomorrow through the end of this week (Sat). */
  weekEvents: CalendarItemDto[];
};
