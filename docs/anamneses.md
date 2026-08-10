# Anamneses (anamnese)

An **anamnese** is a coach-authored **intake questionnaire** — the nutrition
analogue of a form the aluno fills at the start (and at re-evaluations). It lives
at `/coach/anamneses` ("Anamneses"), its own item in the coach sidebar, below
Treinos.

## The clinic owns them — there is no base template

Unlike diets/workouts there is **no shared base** (`clinic_id NULL`) anamnese.
Every anamnese belongs to exactly one clinic. When a clinic is created it
receives its **own copy** of a curated **starter set** (see the seed), and from
then on it owns them outright — create, edit, duplicate, delete. Editing the
starter JSON later only affects clinics created afterwards; existing clinics are
never overwritten.

## Concepts

- An anamnese has a `name`, an optional `description`, and two profile tags:
  **`objective`** (emagrecimento / hipertrofia / saúde / clínico / saúde da
  mulher) and **`modality`** (online / presencial / ambos). The modality is the
  axis behind, e.g., the in-person weight-loss questionnaire asking for skinfolds
  (dobras) while the online one does not.
- The questionnaire is a flat tree of **sections** → **questions**. A question is
  just a `label` plus a basic **type**: `short_text`, `long_text` or `boolean`
  (Sim/Não). No conditional logic, no scales, no choice options — deliberately
  simple (see `docs`/`drizzle/data/anamneses/SOURCE.md`).

Nothing references the food/exercise catalog, so there is **no live hydration**:
the whole questionnaire is one self-contained JSON document.

## Schema

One table (`src/db/schema.ts`), migration `0013_anamneses`:

- **`anamnesis`** — `clinic_id` (**NOT NULL** — always a clinic's own),
  `coach_id` (author, nullable), `name`, `description`, `objective`, `modality`,
  **`sections`** (`jsonb` — the sections→questions tree), timestamps.

## DAL (`src/server/dal/anamneses.ts`)

Every read/write is scoped to `clinic_id = ctx.clinicId`, so a coach can only
touch its own clinic's anamneses:

- `listAnamneses` — a tenant-scoped page with name search and per-row
  section/question counts (derived from the stored JSON). Most-recent first.
- `getAnamnesis` — the full questionnaire, or null when not this clinic's.
- `createAnamnesis` / `updateAnamnesis` — create / replace the whole document
  (stamps `clinicId`/`coachId` from the session).
- `copyAnamnesis` — an exact copy named "<name> (cópia)".
- `deleteAnamnesis` — hard delete (nothing references an anamnese in this phase),
  scoped to the clinic's own.
- `seedClinicAnamneses(db, clinicId, coachId)` — **bootstrap** helper (like
  `createClinicForOwner`): copies the starter set into a clinic. **Idempotent** —
  a clinic that already has anamneses is left untouched. Called from the sign-up
  hook (`src/lib/auth.ts`) for new clinics and from the dev seed.

The starter set lives in `drizzle/data/anamneses/*.json` (the single source of
truth) and is imported by `src/server/anamneses/starter-templates.ts`.

## Backfilling existing clinics

New clinics get their anamneses at creation (the sign-up hook). Clinics created
**before** this feature have none — the **data migration `0014_backfill_anamneses`**
seeds them. Because the migrator applies each migration exactly once (tracked in
the journal), this runs **once, at the next deploy**, and never again — no manual
command. It inserts the starter set only for clinics that have **no** anamnese
yet (a `WHERE NOT EXISTS` guard), so a clinic already seeded by the hook is left
untouched. The migration's contents are generated from the same
`drizzle/data/anamneses/*.json` starter files.

## API (`/api/anamneses`)

All coach-only, zod-validated (`anamnesisFormSchema` / `anamnesisListQuerySchema`
in `src/lib/anamneses.ts`), tenant via `getTenantContext()` + the DAL:

- `GET /api/anamneses` — the listing (search / pagination).
- `POST /api/anamneses` — create (whole questionnaire).
- `GET/PUT/DELETE /api/anamneses/[id]` — detail / replace / delete.
- `POST /api/anamneses/[id]/copy` — "Duplicar".

## UI

All pages are `"use client"` and talk to the API via TanStack Query.

- `/coach/anamneses` — the list: a **TanStack Table on desktop, cards on mobile**
  (name, objetivo/modalidade badges, question count, updated-at). Name search.
- `/coach/anamneses/[id]` — the read view (sections → questions with each
  question's type), with **Duplicar** / **Editar** / **Excluir** (excluir asks
  for confirmation and deletes permanently).
- `/coach/anamneses/new` and `/coach/anamneses/[id]/edit` — the reusable
  **`AnamnesisBuilder`** (`src/components/anamneses/anamnesis-builder.tsx`):
  name/description/objective/modality in **TanStack Form** (zod), and the
  sections→questions tree with add/remove and **drag-reorder** (`@dnd-kit`); each
  question is a label + a type select. The draft is persisted to `localStorage`
  (recovered on return) with a beforeunload guard; the whole tree saves in one
  `POST`/`PUT`.

## Input masks (structured answers)

A **short-text** question may carry an optional `mask` (a small named catalog,
not raw regex) plus optional `min`/`max` for numeric masks:

- `date` — `dd/mm/aaaa`, validated as a real, non-future date.
- `integer` — whole number within `[min, max]` (e.g. idade 0–120, refeições
  1–12, treino 0–14, sono 0–24).
- `decimal` — number with an optional 1-place comma decimal, within `[min, max]`
  (e.g. peso 20–400 kg → `71,4`; água 0–20 L → `2,5`).
- `pressure` — `120/80` (2–3 digits each side).

Validation lives in `@/lib/anamneses` (`validateAnswer` / `validateAnswers`,
client-safe). It's enforced **on both fill surfaces** — the coach fill page and
the public aluno page validate before submit and the API routes
(`/api/anamnesis/fill`, `/api/students/[id]/anamnesis`) re-validate against the
snapshot, returning field-scoped `422` errors. Empty answers stay valid (answers
are optional); only masks are enforced. The builder exposes a **Máscara** select
(+ min/máx for number masks) per short-text question. The starter templates seed
masks for the fields above; `semanas_gestacao` was split into a masked integer
plus a `gestacao_risco` boolean. Compound clinical fields (`glicemia`,
`lipidios`) stay free text.
