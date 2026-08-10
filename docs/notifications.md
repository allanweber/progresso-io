# Notifications

In-app notifications for coaches, shown in a **bell** in the dashboard header.
Generic by design (a `type` + a `data` payload) so future events reuse the same
model; today one event is raised: **`anamnesis_completed`**, when an online
student submits their anamnese via the public fill link.

## Clinic-scoped, per-coach read state

A notification belongs to the **clinic** (the tenant), so every coach in the
clinic sees it. Read-state is tracked **per coach** in `notification_read`, so
each coach has their own unread count. A coach filling an anamnese in-app does
**not** raise a notification (they already know) — only the public aluno submit
does.

## Data model (`0015_student_anamnese_notifications`)

- `notification` — `clinic_id`, `type`, `data` (jsonb, denormalized so the bell
  needs no joins), `created_at`.
- `notification_read` — `(notification_id, user_id)` primary key, `read_at`.
  Absence of a row = unread for that coach.

`anamnesis_completed` payload: `{ studentId, studentName, anamnesisName }`. The
bell row links to the student's "Dados & anamnese" tab.

## Delivery — in-app only (bell + polling)

The bell (`src/components/dashboard/notification-bell.tsx`, coach-only, mounted
in `dashboard-shell`) polls `GET /api/notifications` every ~30s via TanStack
Query, shows an unread-count badge, and lists recent items in a dropdown. Opening
the dropdown marks everything read for that coach (`POST /api/notifications/read`).
There is no e-mail/WhatsApp push for notifications.

## DAL (`src/server/dal/notifications.ts`)

- `createNotification(db, {clinicId, type, data})` — raised from the public
  submit flow (no session), so it takes a raw DB handle + an explicit `clinicId`
  resolved from the fill token.
- `listNotifications(ctx)` / `unreadCount(ctx)` — tenant-scoped, per-coach read
  flag via a left join on `notification_read`.
- `markRead(ctx, ids)` / `markAllRead(ctx)` — per-coach, scoped to the clinic.
