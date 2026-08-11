/**
 * Client-safe notifications domain (no server/database import).
 *
 * Notifications are **clinic-scoped**: every coach in the clinic sees them in
 * their bell, and read-state is tracked per coach. The model is generic (a
 * `type` + a `data` payload) so future events can reuse it; only one event is
 * wired today — `anamnesis_completed`, raised when an online student submits
 * their anamnese via the public link (a coach filling it in never notifies).
 */

export const NOTIFICATION_TYPES = [
  "anamnesis_completed",
  "checkin_submitted",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Payload for `anamnesis_completed`. Denormalized so the bell needs no joins. */
export type AnamnesisCompletedData = {
  studentId: string;
  studentName: string;
  anamnesisName: string;
};

/** Payload for `checkin_submitted`. Denormalized so the bell needs no joins. */
export type CheckinSubmittedData = {
  studentId: string;
  studentName: string;
  /** The check-in's calendar date, `YYYY-MM-DD`. */
  checkinDate: string;
};

/** The discriminated payload union. */
export type NotificationData = AnamnesisCompletedData | CheckinSubmittedData;

/** A notification row as the bell reads it, plus this coach's read flag. */
export type NotificationDto = {
  id: string;
  type: NotificationType;
  data: NotificationData;
  read: boolean;
  createdAt: string;
};

export type NotificationListResponse = {
  items: NotificationDto[];
  /** Count of unread notifications for the current coach. */
  unread: number;
};

/** The PT-BR one-line title shown in the bell dropdown for a notification. */
export function notificationTitle(n: {
  type: NotificationType;
  data: NotificationData;
}): string {
  switch (n.type) {
    case "anamnesis_completed":
      return `${n.data.studentName} preencheu a anamnese`;
    case "checkin_submitted":
      return `${n.data.studentName} enviou um check-in`;
    default:
      return "Nova notificação";
  }
}

/** Where clicking a notification takes the coach. */
export function notificationHref(n: {
  type: NotificationType;
  data: NotificationData;
}): string {
  switch (n.type) {
    case "anamnesis_completed":
      return `/coach/students/${n.data.studentId}`;
    case "checkin_submitted":
      return `/coach/students/${n.data.studentId}/feedback`;
    default:
      return "/coach";
  }
}
