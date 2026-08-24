import type { CalendarItemDto } from "@/lib/calendar";

/**
 * Client-facing DTOs for the coach dashboard (`GET /api/coach/dashboard`).
 *
 * The screen is a work queue, not a report: the four backlogs a coach actually
 * owes someone — an unanswered check-in, an unanswered WhatsApp message, an
 * aluno with no plan, and a draft never published — are merged server-side into
 * one list ranked by how long each has been waiting. The client renders that
 * list; it does not re-derive it.
 */

/** What kind of work a queue row represents. Never encoded by colour alone. */
export type QueueItemKind = "checkin" | "whatsapp" | "missing-plan" | "draft";

/** PT-BR label for each kind, rendered as the row's chip. */
export const QUEUE_KIND_LABELS: Record<QueueItemKind, string> = {
  checkin: "check-in",
  whatsapp: "WhatsApp",
  "missing-plan": "sem plano",
  draft: "rascunho",
};

/** One thing the coach owes someone, with the wait that ranks it. */
export type QueueItemDto = {
  /** Stable client key (`<kind>:<id>`). */
  key: string;
  kind: QueueItemKind;
  /** Aluno name, or the conversation's display name. */
  name: string;
  /** Seed for the deterministic avatar colour — the aluno id where there is one. */
  avatarSeed: string;
  initials: string;
  /** ISO timestamp this has been waiting since. The sort key. */
  waitingSince: string;
  /** Where the row goes — the task, never the record. */
  href: string;
  /** One short secondary fact: weight, message preview, what is missing. */
  detail: string | null;
};

export type CoachDashboardDto = {
  activeCount: number;
  /**
   * The merged queue, oldest wait first, capped server-side. One rule, no
   * hidden weighting: a coach can explain the order to themselves.
   */
  queue: QueueItemDto[];
  /** Total before the cap, so the UI can offer "ver todos (N)". */
  queueTotal: number;
  /** Calendar items dated today, sorted by start time (timed first). */
  todayEvents: CalendarItemDto[];
};
