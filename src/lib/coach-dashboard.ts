import type { CalendarItemDto } from "@/lib/calendar";

/**
 * Client-facing DTOs for the coach dashboard (`GET /api/coach/dashboard`).
 *
 * The screen is a set of counted backlogs, not one merged list: four KPI tiles
 * over per-channel cards, so a coach reads the size of each pile at a glance and
 * drops into whichever one they mean to work. Each list is capped server-side —
 * the dashboard shows a queue, never an archive — and each arrives already
 * ordered, so the client renders rather than re-derives.
 *
 * Because the lists are capped, the counts ride separately in `totals`. The
 * tiles and badges are the coach's read on how much work is waiting; sizing them
 * from a truncated array is how the screen ends up disagreeing with the sidebar.
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

/**
 * A diet or workout version written but never published. Nothing reaches the
 * aluno until the coach publishes, so a forgotten draft is real work that is
 * invisible from every other screen — which is the whole reason it gets a card.
 */
export type PendingDraftDto = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  kind: "diet" | "workout";
  /** ISO instant of the last edit — how long the draft has sat unpublished. */
  updatedAt: string;
};

/**
 * The true size of each pile, independent of how many rows travelled.
 *
 * Every list on this payload is capped server-side, so `list.length` measures
 * the page, not the backlog — and a screen that reads one as the other reports a
 * number the server knows is wrong. The tiles and the card badges read these;
 * the lists render only what arrived. When a total exceeds the rows on hand, the
 * card says so out loud rather than letting the difference vanish.
 */
export type CoachDashboardTotalsDto = {
  missingPlans: number;
  pendingCheckins: number;
  pendingDrafts: number;
  /** Uncapped, and the same source the sidebar badge counts. */
  waWaiting: number;
};

export type CoachDashboardDto = {
  activeCount: number;
  /**
   * Every non-archived aluno — convidados and inativos included. This is the
   * population the plan cap counts, and it is what decides whether the screen
   * shows its first-run state: a coach whose three invites are still pending has
   * an `activeCount` of 0 but has plainly already started.
   *
   * It rides on this payload rather than being read from `/plan-usage` so the
   * decision needs one response, not two agreeing with each other.
   */
  rosterCount: number;
  missingPlans: MissingPlanStudentDto[];
  pendingCheckins: PendingCheckinDto[];
  waWaiting: WaWaitingDto[];
  pendingDrafts: PendingDraftDto[];
  /** Calendar items dated today, sorted by start time (timed first). */
  todayEvents: CalendarItemDto[];
  /** Calendar items from tomorrow through the end of this week (Sat). */
  weekEvents: CalendarItemDto[];
  /** True sizes of the capped lists above. Never derive a count from `.length`. */
  totals: CoachDashboardTotalsDto;
};
