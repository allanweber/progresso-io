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
   **active** student, computed live: `last check-in (or join day) + the clinic's
   cadence interval` (`clinic.feedbackFrequency` — semanal/quinzenal/mensal). The
   interval is a whole number of weeks (7 / 14 / 28), so the marker **keeps the
   student's own weekday** — the day the student registered / last checked in on;
   only the *interval* comes from the clinic, not a global preferred day. If the
   projected date is already past (the student is **overdue**), it rolls forward
   by whole intervals — staying on that weekday — to the next future occurrence
   and is flagged red. Markers roll forward automatically as check-ins arrive.

   **Derived markers are not frozen** — they can be edited and moved like any
   event. Clicking one opens the editor; **saving it materializes it** into a
   real `calendar_event` (it has no id, so the save is a create). Dragging one
   also materializes it at the dropped day/time. Once a student has a stored
   `checkin` event dated today-or-later, the derived generator **stops emitting
   its marker** for that student (the record takes over), so the two never
   double up.

3. **Derived invoice markers** (never stored) — each **pending fatura** shows on
   its due date as a read-only **"Administrativo"** (amber) appointment
   (`Fatura #NNNN`), so the coach sees upcoming cobranças/renovações. Faturas are
   the *clinic's* own Progresso subscription invoices, managed by a platform
   admin — so these markers are **not** draggable or editable; clicking one jumps
   to the **Faturas** card in `/coach/settings`. Only `pending` invoices appear
   (paid/canceled don't); an overdue one is flagged red.

## Dates & times are locale-proof

Native `<input type="date">` / `type="time"` render in the **browser's** locale
(a US device shows `mm/dd/yyyy` + `9:30 AM`), which can't be overridden. So the
app uses `DateInput` / `TimeInput` (`src/components/ui/date-input.tsx`) — masked
text inputs that always display **dd/mm/aaaa** and **24h HH:MM** regardless of
device locale, while storing the canonical `yyyy-mm-dd` / `HH:MM`. Use them in
place of native date/time inputs everywhere (calendar event modal, admin billing).

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
  state, `@dnd-kit` drag-and-drop reschedule + materialize-on-drag/click), the
  gated "Calendário" nav item, the two dashboard cards, and the admin
  clinic-limits "Calendário" toggle.
- Tests: `tests/calendar.test.ts` (pure date math + `computeCheckinDue`),
  `tests/calendar.integration.test.ts` (CRUD isolation, derived markers, gate),
  `e2e/calendar.spec.ts` (views + create round-trip + screenshots).
