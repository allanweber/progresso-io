# Clinic settings (Configurações)

Clinic-wide configuration for a coach, at `/coach/settings`. The clinic is the
tenant (see `AGENTS.md`), so these are per-clinic settings, read/written by any
coach in the clinic and scoped to `ctx.clinicId` — never client input.

## Sections

The screen mirrors the design mockup. Two sections are **real and editable**, the
rest are placeholders for features not built yet.

| Section | State | Backing |
| --- | --- | --- |
| **Clínica** | Real | `clinic.name`, `clinic.portal_subdomain` |
| **Preferências de feedback** | Real | `clinic.feedback_frequency`, `clinic.feedback_preferred_day`, `clinic.feedback_whatsapp_reminder` |
| **Plano atual** | Real (read-only) | `clinic.plan` (chosen at sign-up) |
| **WhatsApp Business** | *Em breve* | — |
| **Equipe de coaches** | *Em breve* | — |

### Clínica

- **Nome da clínica** → `clinic.name` (required, ≤ 80 chars).
- **Subdomínio do portal** → `clinic.portal_subdomain`. **Optional**; when set it
  must be a slug (`[a-z0-9]` in hyphen-separated groups, 3–30 chars) and is
  **globally unique** across the platform (partial unique index
  `clinic_portal_subdomain_uq`, only enforced when present — blank clinics never
  collide). Nothing routes on it yet; it is stored so the future
  portal-subdomain feature has it. A duplicate surfaces as a field error
  (`Este subdomínio já está em uso.`).

### Preferências de feedback

The clinic's default check-in cadence for its students. The **frequency** is
consumed by `computeCheckinDue` (`src/lib/calendar.ts`), which advances a
student's own weekday — their join day, or the day they last checked in — by this
interval. The clinic chooses the interval, never the weekday, so a roster's
check-ins spread across the week rather than landing together.

- **Frequência** → `feedback_frequency`: `semanal | quinzenal | mensal`
  (default `semanal`).
- **Dia preferido** → `feedback_preferred_day`: a weekday
  (`monday`…`sunday`, default `monday`).
- **Lembrete automático por WhatsApp** → `feedback_whatsapp_reminder` (boolean,
  default `true`).

### Plano atual

Displays the clinic's real plan (name/description/price from `src/lib/plans.ts`,
shared with the sign-up wizard). The plan is **read-only** here — changing plans
is not part of this screen — and billing/renewal renders *Em breve*.

## Architecture

Follows the written-in-stone frontend rules:

- **Page** (`src/app/coach/settings/page.tsx`) is a client component; the
  coach-only guard stays in the server layout (`src/app/coach/layout.tsx`).
- All traffic goes through **API route handlers + TanStack Query**:
  `GET`/`PUT /api/coach/settings` (`src/app/api/coach/settings/route.ts`). Each
  validates input with **zod** (`clinicSettingsSchema` in
  `src/lib/clinic-settings.ts`) and derives the tenant via `getTenantContext()`.
- All DB access goes through the **DAL** (`src/server/dal/clinics.ts`):
  `getClinicSettings`, `updateClinicSettings`, `isSubdomainTaken`.
- The form uses **TanStack Form**; one "Salvar alterações" button saves both real
  sections in a single `PUT`.

## Data model

New columns on `clinic` (migration `0018_adorable_anthem.sql`), all backfilled
with defaults so existing clinics keep saving:

```
portal_subdomain          text            -- nullable; partial unique when set
feedback_frequency        text  NOT NULL  DEFAULT 'semanal'
feedback_preferred_day    text  NOT NULL  DEFAULT 'monday'
feedback_whatsapp_reminder boolean NOT NULL DEFAULT true
```

## Tests

- `tests/clinic-settings.integration.test.ts` — persistence, plan stays
  read-only, tenant isolation, and subdomain conflict detection (cross-clinic
  taken, own-clinic re-save allowed).
- `e2e/settings.spec.ts` (coach project) — edits the real sections, saves,
  asserts the coming-soon bodies, and captures desktop + mobile screenshots.
