# Plan limits & coach team

Two related pieces: **per-plan capability limits** (how many alunos/coaches a
clinic may hold, and whether it can use WhatsApp) and the **coach team** — the
`Clínica` plan's multi-coach management, where the clinic owner invites and
removes coaches.

## Plan capabilities (`plan_limit`)

`plan_limit` is reference data (not tenant-scoped), keyed by the lowercase plan
name, so limits are edited in the database rather than hardcoded. Seeded values:

| Plan       | `max_students` | `max_coaches` | `whatsapp` | `calendar` | `archive` | `ai_generations` /mo | Branded portal |
| ---------- | -------------: | ------------: | :--------: | :--------: | :-------: | -------------------: | :------------: |
| free       |              5 |             1 |    true    |   false    |   false   |                    1 |       no       |
| solo       |             50 |             1 |    true    |    true    |   false   |                   10 |      yes       |
| clinica    |            100 |             3 |    true    |    true    |   true    |                   25 |      yes       |
| enterprise |     null (∞)   |    null (∞)   |    true    |    true    |   true    |             null (∞) |      yes       |

The branded portal is not a `plan_limit` column: it is `BRANDED_PORTAL_PLANS` in
`src/lib/clinic-settings.ts`. Free's values were set by migration `0049`
(3 → 5 alunos, WhatsApp on).

### Why Free sits at 5 alunos

Free must stop **just below a real business** so growth itself pushes the coach
to Solo. At ~R$150/aluno, 5 alunos is ~R$750/mo of coaching revenue: enough to run
a few real clients end to end, not enough to live on. A coach with a real
business (~10+ alunos, R$1.500+/mo) hits the cap as soon as they add their
roster, and at that size Solo (R$179) is a small share of what they bill. The
upgrade levers beyond the cap are Calendário, the branded portal, AI
generations (1 → 10) and, once it ships, automatic WhatsApp. The 14-day trial
grants Solo limits, so every coach sees the paid tier before landing on Free.

`null` means **unlimited** — for a cap that's explicitly uncapped, and also when
no row exists (a missing limit must never block). Read them through
`plans.getPlanLimits(ctx)` (or the `getStudentLimit` / `getCoachLimit` /
`canUseWhatsapp` / `canUseCalendar` shortcuts), always derived from the session's
clinic. The `calendar` capability gates the coach Calendar/Agenda (Free
excluded) — see `docs/calendar.md`.

### Per-clinic overrides (admin clinic detail)

A platform admin sets limits for **one clinic** from `/admin/clinics/[id]` →
"Limites desta clínica": máx. alunos, máx. coaches, WhatsApp, arquivar and
Calendário. Each is stored as a nullable override column on `clinic`
(`max_students_override`, `max_coaches_override`, `whatsapp_override`,
`archive_override`, `calendar_override`) — **`null` = inherit the plan
default**; a value wins for that clinic only, without changing its plan.
`getPlanLimits` resolves `override ?? plan_default`, so overrides layer on top of
`plan_limit`. Backed by `PUT /api/admin/clinics/[id]/limits` (admin-gated); the
effective limits + plan defaults come back on `GET /api/admin/clinics/[id]`.

The plan defaults themselves live in `plan_limit` and are established by the
seed (fresh DBs) and by migration `0025`, which **upserts** the canonical values
so a deployed environment with a missing/`NULL` `plan_limit` row (e.g. Solo left
at unlimited after `0024`) is corrected on migrate.

### Enforcement is soft (never destructive)

Limits only gate **new** additions; nothing is ever removed on a downgrade.

- **Alunos** — registration is blocked once the clinic is at `max_students`
  (archived students don't count — archiving frees a seat). See
  `POST /api/students`.
- **Coaches** — an invite is blocked once **accepted coaches + pending invites**
  reach `max_coaches` (see seat accounting below).
- If an admin downgrades a plan and the clinic is now over the new cap, the
  existing coaches/alunos keep working; only new adds are blocked until the
  clinic is back under the cap.

### Where usage is shown

`GET /api/coach/plan-usage` returns the clinic's usage vs. caps (active alunos,
coaches, WhatsApp included) — any coach may read it. Three surfaces share the
one `coach-plan-usage` query (TanStack dedupes the cache):

- **"Plano atual" card** (settings) — a full list: `Alunos 34/50`,
  `Coaches 2/3`, `WhatsApp Incluído`, with an "at limit" accent.
- **Students roster** — a `34 / 50 alunos` chip next to "Adicionar aluno".
- **Dashboard** — no longer shows usage. The KPI tiles were removed when the
  dashboard became a work queue, so `coach-plan-usage` is read there only to
  swap the "Convidar aluno" button for a "Limite de N alunos · ver planos" link
  once `isAtLimit` is true. Surfacing the count again is an open design question
  (see the critique snapshots in `.impeccable/critique/`).

`formatUsage(used, limit)` renders `34 / 50` (or just `34` when unlimited);
`isAtLimit` drives the accent.

### Archive vs. hard-delete (paid tier)

Archiving a student (soft-remove, keeps history, frees a slot) is a paid-tier
capability — `plan_limit.archive` (Free/Solo = false, Clínica/Enterprise = true),
per-clinic-overridable via `clinic.archive_override`, resolved in
`getPlanLimits().archive`. Consequences:

- **Clínica/Enterprise** — the student profile shows **Arquivar/Reativar**;
  `DELETE /api/students/[id]` archives (and is refused if the plan can't archive).
- **Free/Solo** — no archive; the profile shows **Excluir** (a confirmed,
  permanent delete) →`DELETE /api/students/[id]/delete` (`students.hardDeleteStudent`,
  tenant-scoped: removes the student, its history and the aluno's login). This
  route is refused for plans that *can* archive, so each plan has exactly one
  removal path. Migration `0026` seeds the `archive` defaults (upsert-safe).

### WhatsApp gate

Today WhatsApp is the **handoff** (`wa.me` / WhatsApp Web, see
`docs/adr/0002-whatsapp-official-cloud-api-with-handoff-bridge.md`): the app
prepares each message and the coach sends it from their own number. It costs us
nothing per message, so **every plan includes it, Free too**, and Free keeps it
after the Cloud API ships. The `whatsapp` capability is therefore `true` on every
plan; `plans.canUseWhatsapp(ctx)` still guards every send site so a platform
admin can switch it off for one clinic (`clinic.whatsapp_override = false`).
When it is off, the clinic falls back to e-mail:

- the anamnese-fill link at registration (WhatsApp-only → skipped; the student
  is still registered),
- the portal-access invite (always e-mailed too, so onboarding still works),
- check-in feedback (stays visible in the portal).

**When the Cloud API ships**, automatic sending (Meta bills per template) is
the paid part: add a separate capability for it (Solo and up) rather than
reusing `whatsapp`, which must stay `true` on Free for the handoff. The landing
already lists "WhatsApp automático" as *em breve* on Solo.

## Coach team ("Equipe de coaches")

The `Clínica` plan lets several coaches share one clinic. Team management lives
on `/coach/settings` as the **owner-only** "Equipe de coaches" card, and is
hidden entirely for non-owner coaches and on single-seat plans (free/solo). All
coaches in a clinic share its data (tenancy is by `clinicId`); `coachId` on a
student is just an assignment label.

### Seat accounting

A coach seat is consumed by an **accepted coach (owner included)** OR a
**still-pending invite**, so the cap can't be over-committed and two invitees
can't race into one seat. The footer reads *Plano {name} · {maxCoaches} vagas ·
{accepted} ocupadas*; the invite button disables at `accepted + pending =
maxCoaches`. Re-inviting an already-pending e-mail is a resend (supersede) and
doesn't claim a new seat.

### Inviting a coach

`POST /api/coach/team` (owner-only) validates the invite with zod, rejects an
e-mail that already has an account (a coach belongs to a single clinic), checks
the seat, then creates a `coach_invitation` (clinic-scoped; SHA-256 token hash,
raw token e-mailed only) and sends the invite e-mail. The invitee opens
`/coach-invite/accept?token=…`, sets a name + password, and a `user` row is
created with `role = "coach"` and `clinicId` set to the inviting clinic — the
throwaway clinic auto-created at sign-up is dropped, and no session is
established (they're sent to `/login`). Mirrors the admin-invite flow.

### Removing a coach

`DELETE /api/coach/team/coaches/[coachId]` (owner-only):

1. **Transfers all the coach's alunos to the owner** (`coachId` → owner), so no
   student is left unassigned.
2. **Hard-deletes** the account (sessions/accounts cascade; any diets/workouts/
   foods they authored keep existing with authorship nulled via FKs).

The **owner** (`clinic.ownerUserId`) and the **acting user** are protected from
removal. Canceling a pending invite is
`DELETE /api/coach/team/invites/[inviteId]`, which frees the reserved seat.

## Landing / sign-up copy

The pricing table (`src/lib/landing-content.ts`) and the sign-up wizard
(`src/lib/plans.ts`) reflect the caps above, and the landing adds an "Equipe de
Coaches" feature highlighting the `Clínica` multi-coach team.

The plan the coach picks in the wizard is **honoured** at sign-up: the confirm
step submits it, `signUpCoach` validates it against `SIGNUP_PLAN_IDS` (only
`free`/`solo`/`clinica` — never `enterprise`; anything else falls back to
`free`), and threads it through `withSignUpPlan` into Better Auth's
clinic-bootstrap hook so the new clinic starts on the chosen plan instead of the
`free` default. Sign-up paths that don't set it (invite-accept, Google) keep the
`free` default, and a platform admin can still change any clinic's plan later.

## Files

- Schema: `plan_limit` (+`max_coaches`, `whatsapp`), `coach_invitation`
  (migration `0024`).
- DAL: `plans.ts` (capabilities), `coaches.ts` (roster, owner check, removal),
  `coach-invitations.ts` (invite lifecycle).
- lib: `coaches.ts` (DTOs, zod, seat math — pure/testable).
- API: `coach/team` (GET/POST), `coach/team/coaches/[coachId]` (DELETE),
  `coach/team/invites/[inviteId]` (DELETE), `coach-invitations/accept` (GET/POST).
- UI: "Equipe de coaches" card in `coach/settings/page.tsx`;
  `coach-invite/accept` page + `InviteAcceptForm kind="coach"`.
- Tests: `tests/coaches.test.ts` (unit), `tests/coaches.integration.test.ts`.
