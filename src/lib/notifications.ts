/**
 * Client-safe notifications domain (no server/database import).
 *
 * Notifications are **clinic-scoped**: every coach in the clinic sees them in
 * their bell, and read-state is tracked per coach. The model is generic (a
 * `type` + a `data` payload) so events can reuse it: an online student
 * submitting their anamnese, a student submitting a check-in, and a new inbound
 * WhatsApp message (coalesced — only when the conversation goes 0 → unread).
 */

export const NOTIFICATION_TYPES = [
  "anamnesis_completed",
  "checkin_submitted",
  "whatsapp_received",
  "student_checkin_inactive",
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

/**
 * Payload for `whatsapp_received`. Raised only when a conversation transitions
 * from 0 → unread (coalesced), so a rapid back-and-forth rings the bell once.
 * `studentId` is null for an unknown-number thread; `contactName` is then the
 * formatted phone. Denormalized so the bell needs no joins.
 */
export type WhatsappReceivedData = {
  conversationId: string;
  studentId: string | null;
  contactName: string;
  preview: string;
};

export type StudentCheckinInactiveData = {
  studentId: string;
  studentName: string;
  daysSinceLastCheckin: number;
};

/** The payload union (keyed by the row's `type`). */
export type NotificationData =
  | AnamnesisCompletedData
  | CheckinSubmittedData
  | WhatsappReceivedData
  | StudentCheckinInactiveData;

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
      return `${(n.data as AnamnesisCompletedData).studentName} preencheu a anamnese`;
    case "checkin_submitted":
      return `${(n.data as CheckinSubmittedData).studentName} enviou um check-in`;
    case "whatsapp_received":
      return `${(n.data as WhatsappReceivedData).contactName} enviou uma mensagem no WhatsApp`;
    case "student_checkin_inactive": {
      const d = n.data as StudentCheckinInactiveData;
      return `${d.studentName} sumiu — sem check-in há ${d.daysSinceLastCheckin} dias`;
    }
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
      return `/coach/students/${(n.data as AnamnesisCompletedData).studentId}`;
    case "checkin_submitted":
      return `/coach/students/${(n.data as CheckinSubmittedData).studentId}/feedback`;
    case "whatsapp_received":
      return "/coach/whatsapp";
    case "student_checkin_inactive":
      return `/coach/students/${(n.data as StudentCheckinInactiveData).studentId}`;
    default:
      return "/coach";
  }
}
