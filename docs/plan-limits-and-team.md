# Plan limits & coach team

Two related pieces: **per-plan capability limits** (how many alunos/coaches a
clinic may hold, and whether it can use WhatsApp) and the **coach team** — the
`Clínica` plan's multi-coach management, where the clinic owner invites and
removes coaches.

## Plan capabilities (`plan_limit`)

`plan_limit` is reference data (not tenant-scoped), keyed by the lowercase plan
name, so limits are edited in the database rather than hardcoded. Seeded values:

| Plan       | `max_students` | `max_coaches` | `whatsapp` |
| ---------- | -------------: | ------------: | :--------: |
| free       |              3 |             1 |   false    |
| solo       |             50 |             1 |    true    |
| clinica    |            100 |             3 |    true    |
| enterprise |     null (∞)   |    null (∞)   |    true    |

`null` means **unlimited** — for a cap that's explicitly uncapped, and also when
no row exists (a missing limit must never block). Read them through
`plans.getPlanLimits(ctx)` (or the `getStudentLimit` / `getCoachLimit` /
`canUseWhatsapp` shortcuts), always derived from the session's clinic.

### Admin-managed (Manutenção → Planos)

Platform admins edit these values from **/admin/maintenance → Planos**: a table
of every plan with its máx. alunos, máx. coaches (blank = ilimitado) and whether
WhatsApp is included. Because `plan_limit` is reference data, a change applies
immediately to every clinic on that plan. Backed by `GET /api/admin/plan-limits`
+ `PUT /api/admin/plan-limits/[plan]` (admin-gated), which upsert so a plan whose
row was never seeded is created rather than ignored — the way to correct an
environment where the columns were added by migration but never seeded (e.g. a
plan left at `max_coaches = NULL`).

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
- **Dashboard** — the "Alunos ativos" KPI gains a `de 50 · plano Clínica`
  subtitle (`sem limite` when uncapped).

`formatUsage(used, limit)` renders `34 / 50` (or just `34` when unlimited);
`isAtLimit` drives the accent.

### WhatsApp gate

WhatsApp is a paid-plan channel. `plans.canUseWhatsapp(ctx)` guards the three
send sites; a **free** clinic simply skips WhatsApp and falls back to e-mail:

- the anamnese-fill link at registration (WhatsApp-only → skipped for free; the
  student is still registered),
- the portal-access invite (always e-mailed too, so onboarding still works),
- check-in feedback (stays visible in the portal).

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
