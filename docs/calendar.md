# Calendar / Agenda (coach)

The coach's scheduling surface at `/coach/calendar` — a Mês / Semana / Dia
calendar of the clinic's events, plus a "Próximos 14 dias" agenda. It's a
**paid-tier** feature (Free excluded) and lives entirely behind the coach area.
The dashboard also grows two data-backed triage cards alongside it.

## What the calendar shows — two merged sources

The calendar merges two things on **read**; only the first is stored.

1. **Stored events** (`calendar_event`) — the ad-hoc events a coach types in via
   "＋ Evento": an in-person **avaliação** (`presencial`), an **administrativo /
   renovação** (a client renewing their coaching — paid to the coach offline,
   since students never pay in-app), or a one-off **check-in** the coach pins by
   hand. Full CRUD, clinic-scoped.
2. **Derived check-in markers** (never stored) — one **"próximo check-in"** per
   **active** student, computed live from the clinic cadence
   (`clinic.feedbackFrequency` + `feedbackPreferredDay`) and the student's last
   check-in: `last (or join day) + interval`, snapped forward to the preferred
   weekday. If that lands in the past the student is **overdue** — the marker is
   surfaced on the next preferred day on/after today and flagged red, rather than
   buried weeks back. These are **read-only** (no id); clicking one jumps to the
   student's **Feedback** tab. They roll forward automatically as check-ins
   arrive, so nothing has to be re-scheduled.

There is deliberately **no derived "renovação"** source: the app models no
student billing (invoices are the *clinic's* own Progresso subscription, managed
by a platform admin), so administrativo/renovação events are manual only.

## Tenancy & visibility

`calendar_event` carries `clinicId` (the tenant key) and every query is scoped by
it via the DAL (`src/server/dal/calendar-events.ts`), like every other domain
table. Events are **clinic-wide**: in a multi-coach Clínica every coach sees all
events and all active students' check-in markers — consistent with the rest of
the app treating clinic data as shared. `coachId` on an event is **attribution
only**, not access control. An optional `studentId` links an event to a student
(nullable FK; `set null` if the student is removed) and also gives the future
WhatsApp-reminder engine a concrete student + phone with no schema change.

## Time & timezone

An event has a required **date** and an **optional time** (`startTime` /
`endTime`, `HH:MM`); no time = an all-day item, pinned at the top of the week/day
grids. "Today", "overdue" and day-bucketing are all computed against a fixed
**`America/Sao_Paulo`** clock (`todayYmd` in `src/lib/calendar.ts`) so the result
is deterministic regardless of the server's timezone. All date math operates on
plain `YYYY-MM-DD` strings anchored at noon-UTC, so day arithmetic never trips a
DST/offset boundary.

## Plan gate

The Calendar is gated exactly like WhatsApp/archive: a `plan_limit.calendar`
boolean (Free = false, Solo/Clínica/Enterprise = true) with a per-clinic
`clinic.calendar_override` (`null` = inherit the plan). Resolved by
`plans.getPlanLimits().calendar` / `plans.canUseCalendar(ctx)` — `override ??
plan_default`. The coach layout hides the "Calendário" nav item when the plan
doesn't include it; the page itself shows an **upsell empty-state** if a Free
coach hits the route directly (the API answers 403). A platform admin can toggle
the override per clinic on `/admin/clinics/[id]` → "Limites desta clínica"
("Calendário"). Seeded by migration `0027` (upsert-safe) and the seed defaults.

## API

All coach-only, plan-gated (`canUseCalendar`), tenant via `requireClinic` + DAL,
every input zod-validated (`src/lib/calendar.ts`):

- `GET /api/coach/calendar?from=&to=` → the merged items + active-student options
  for the picker, for the date range.
- `POST /api/coach/calendar` → create an event.
- `PATCH /api/coach/calendar/[id]` / `DELETE /api/coach/calendar/[id]` → edit /
  remove a stored event (derived markers have no id and can't reach these).

Read/written from the client through TanStack Query + TanStack Form, per the
frontend rules. The server schema (`calendarEventInputSchema`) coerces empty
strings to `null`; a separate string-only `calendarEventFormSchema` drives the
form's on-change validation.

## Dashboard triage cards

`GET /api/coach/dashboard` (all plans) now also returns **`pendingCheckins`** —
aluno-submitted check-ins with no coach feedback yet (`author = student`,
`feedbackAt IS NULL`), newest first. The coach dashboard renders two real cards:

- **Check-ins aguardando resposta** — the pending list (→ each student's Feedback
  tab) + a KPI count.
- **Sem treino ou dieta** — active students with no published workout **or** diet
  (already existed).

These are **not** plan-gated (generic triage, available to Free too); only the
Calendar itself is paid.

## Files

- Schema: `calendar_event` (+`plan_limit.calendar`, `clinic.calendar_override`),
  migration `0027`.
- lib: `calendar.ts` (types, zod, PT-BR labels + colours, BRT date math,
  `computeCheckinDue`); `plans.ts` (`PLAN_DEFAULT_CALENDAR`).
- DAL: `calendar-events.ts` (merged read + CRUD), `plans.ts`
  (`getPlanLimits().calendar`, `canUseCalendar`), `students.ts`
  (`getCoachDashboard` pending check-ins), `admin.ts` (limits row + override).
- API: `coach/calendar` (GET/POST), `coach/calendar/[id]` (PATCH/DELETE),
  `coach/dashboard` (extended), `admin/clinics/[id]/limits` (+calendar).
- UI: `/coach/calendar` page (month/week/day, event modal, upcoming panel, upsell
  state), the gated "Calendário" nav item, the two dashboard cards, and the admin
  clinic-limits "Calendário" toggle.
- Tests: `tests/calendar.test.ts` (pure date math + `computeCheckinDue`),
  `tests/calendar.integration.test.ts` (CRUD isolation, derived markers, gate),
  `e2e/calendar.spec.ts` (views + create round-trip + screenshots).
