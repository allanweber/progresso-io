# Student diets (dieta do aluno)

A **versioned, snapshotted** diet assigned to one student — distinct from the
reusable template `diet` (see `docs/diets.md`). It lives in the **Dieta** tab of
the student profile (`/coach/students/[id]/diet`). Coach-only in this phase; the
aluno-facing view is a later phase (publishing just makes a version available).

## Concepts

- A student accumulates a **history of diets**, but only **one is `active`** at a
  time (the current plan). Each diet is a named container with an incremental
  **version** chain (1..N).
- A coach builds a **draft** (not visible to the aluno) and **publishes** it.
  Each publish numbers a new **immutable** version. At most **one draft** exists
  per student at a time, so the tab is always in exactly one state:
  **draft** → builder; else **current** → read view; else **empty**.
- Starting a **new diet** (blank or copied from a template) creates a fresh
  `draft` container. The student keeps seeing the previously-published diet until
  the new one's **first publish**, which archives the old diet and makes the new
  one active.
- Editing the active diet clones its latest published version into a new draft
  version on the same diet; publishing it adds the next version number.

## Snapshot (self-contained JSON, embedded on the server)

Each version stores its whole meal tree as one **`jsonb` document** (`DietTree`,
`src/lib/student-diets.ts`) with the food **embedded** — description, code,
origin, `per100` macros — and the scaled **`macros`** and per-meal / diet
**totals** pre-computed. So a published version is **immutable**: editing or
archiving a base food later never changes it (an integration test asserts this).

The tree is always built on the **server** from the catalog (never trusted from
the client): the client sends the same whole-tree payload the template builder
emits (`foodId` + `grams` + measure + substitutes), and the DAL loads the
referenced foods (visibility-checked) and embeds the snapshot.

## Schema

Two tables (`src/db/schema.ts`), migration `0010_student_diets`:

- **`student_diet`** — the named plan: `clinic_id` (tenant), `student_id`,
  `name`, `source_diet_id` (nullable, provenance to the copied template — `on
  delete set null`), `status` (`draft` | `active` | `archived`), timestamps.
- **`student_diet_version`** — `student_diet_id`, `version` (int, NULL while
  draft), `status` (`draft` | `published`), `tree` (`jsonb`), `notes`,
  `published_at`, `published_by`, timestamps. `UNIQUE(student_diet_id, version)`
  (NULL drafts are distinct in Postgres, so a draft is never blocked). Versions
  inherit tenancy through their FK to `student_diet`.

## DAL (`src/server/dal/student-diets.ts`)

Every function takes a `TenantContext` and scopes by `ctx.clinicId` +
`studentId` (the student must belong to the clinic):

- `getStudentDietState` — one read for the tab: the aluno-visible `current`
  (active diet's latest published), the in-flight `draft`, and the `history`.
- `getStudentDietVersion` — a single published version's tree (history view).
- `createBlankDraft` / `createFromTemplate` — start a new diet (draft v1); the
  template copy reuses `getDiet` and re-embeds the tree.
- `editActive` — open a draft of the active diet (clones its latest tree).
- `saveDraft` — save the draft's tree/name/notes (rebuilds the embedded tree).
- `publishDraft` — save + number + freeze; a new diet's first publish archives
  the previous active one. Requires ≥ 1 item (`empty` otherwise).
- `discardDraft` — delete the draft; a brand-new diet with no published version
  is removed entirely.
- `saveAsTemplate` — export a version to the clinic's template catalog (reuses
  `diets.createDiet`).

A guard on any second draft returns `has_draft`. Foods invisible to the clinic
return `invalid_food`.

The template DAL also gains **`deleteDiet`** (`src/server/dal/diets.ts`): a hard
delete of a clinic's template, allowed only when it is **archived** and **no
student diet references it** (`source_diet_id`) — otherwise `not_archived` /
`in_use`.

## API (`/api/students/[id]/diet`)

All coach-only, zod-validated, tenant via `getTenantContext()` + the DAL:

- `GET /api/students/[id]/diet` — the tab state.
- `POST /api/students/[id]/diet` — start a draft; body is a discriminated union
  `{ kind: "blank", name } | { kind: "template", dietId, name? } | { kind: "edit" }`.
- `PUT /api/students/[id]/diet/draft` — save the draft (whole-tree payload,
  validated by the shared `dietFormSchema`).
- `POST /api/students/[id]/diet/draft/publish` — publish (same payload).
- `DELETE /api/students/[id]/diet/draft` — discard the draft.
- `POST /api/students/[id]/diet/template` — save as a template (`{ versionId? }`).
- `GET /api/students/[id]/diet/versions/[versionId]` — a version's tree.

## UI

The student profile gains a **Dados | Dieta** tab bar (`StudentTabs`, shared by
both tab pages); route protection is the server layout
(`students/[id]/layout.tsx`, `requireClinic`). The **Dieta** page
(`students/[id]/diet/page.tsx`) is a client component driving the state machine:

- **Empty** — *Criar dieta nova* (names it) / *Atribuir da minha lista* (template
  picker).
- **Current** — read view (reuses `DietMealsView` + `MacroSummary`) with the
  version + published date, actions *Editar* / *Salvar como modelo* / *Nova
  dieta* (blank or from list), and a read-only **Histórico** (older versions of
  the current diet + archived diets; a version opens in a dialog).
- **Draft** — the reusable **`DietBuilder`** driven by an `adapter` prop
  (server-persisted draft: *Salvar rascunho* / *Publicar* / *Descartar*); the
  local-draft mirror is disabled since the server holds it.
