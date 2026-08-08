# Student diets (dieta do aluno)

A **versioned, reference-based** diet assigned to one student — distinct from the
reusable template `diet` (see `docs/diets.md`). It lives in the **Dieta** tab of
the student profile (`/coach/students/[id]/diet`) and in the aluno portal
(`/student`, see `docs/student-portal.md`).

## Concepts

- A student accumulates a **history of diets**, but only **one is `active`** at a
  time (the current plan). Each diet is a named container with an incremental
  **version** chain (1..N).
- A coach builds a **draft** (not visible to the aluno) and **publishes** it.
  Each publish numbers a new version (the record of *what was prescribed and
  when*). At most **one draft** exists per student at a time.
- Opening the tab always lands on a **read view** — the active diet and its
  history — never the builder. The builder is entered only by an explicit action
  (*Editar* / *Continuar editando* / *Nova dieta*); it is local UI state, so
  re-opening the tab returns to the read view with the draft intact. *Cancelar*
  in the builder returns to the read view (the draft is kept); *Descartar*
  deletes it.
- Starting a **new diet** (blank or copied from a template) creates a fresh
  `draft` container. The student keeps seeing the previously-published diet until
  the new one's **first publish**, which archives the old diet and makes the new
  one active.
- Editing the active diet clones its latest published version into a new draft
  version on the same diet; publishing it adds the next version number.

## Stored structure + live hydration (no snapshot)

Each version stores only the **prescription structure** as one **`jsonb`
document** (`DietStructure`, `src/lib/student-diets.ts`): the **references** —
`foodId` + `grams` + measure per item, plus the coach's equivalence refs. It
stores **no** macros or descriptions.

On every read the DAL **hydrates** that structure against the **current** catalog
(`hydrateStructure`, `src/server/dal/student-diets.ts`): it loads the referenced
foods (visibility-checked), computes the scaled `macros` + per-meal / diet
`totals`, and attaches each food's live **catalog substitutes** (`foodSubstitutes`,
`grams` per 100 g of the item's food) — producing the read `DietTree` the views
already render. Writes only validate that every referenced food is visible
(`invalid_food` otherwise) and store the structure.

Because nutrition and substitutions are **derived live**, a coach's catalog
correction (a food's macros, a new/changed substitution) reaches **every**
student immediately, with **no re-publish**. The trade-off: a version is no longer
a frozen nutritional record — an archived version reflects the current catalog,
and a **hard-deleted** food shows an "Alimento indisponível" placeholder (null
macros). Versioning still records *which foods/quantities* were prescribed (the
structure) and when. Legacy snapshot rows from before this change are **not
migrated** (ignored).

The aluno lists a small "N substituições" indicator per food and shows the full,
portion-scaled swap list in the food-detail dialog; the coach's read view renders
them via the shared `DietMealsView`.

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

- `hydrateStructure` — the core read helper: turns a stored `DietStructure` into
  a live `DietTree` (macros + catalog substitutes from the current catalog).
- `getStudentDietState` — one read for the tab: the aluno-visible `current`
  (active diet's latest published), the in-flight `draft`, and the `history`.
  `current`/`draft` trees are hydrated live.
- `getStudentDietVersion` — a single published version, hydrated live (history).
- `createBlankDraft` / `createFromTemplate` — start a new diet (draft v1); the
  template copy reuses `getDiet` and stores its structure.
- `editActive` — open a draft of the active diet (copies its stored structure).
- `saveDraft` — save the draft's structure/name/notes (foods validated visible).
- `publishDraft` — save + number the version; a new diet's first publish archives
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
  the current diet + archived diets; a version opens in a dialog). When a draft
  is pending, *Editar* becomes *Continuar editando*, a banner offers *Descartar
  rascunho*, and the *Nova dieta* actions are disabled until it is resolved.
- **Pending draft, nothing published** — a first-ever diet still in draft shows a
  read card (*Continuar editando* / *Descartar rascunho*), not the builder.
- **Builder** — the reusable **`DietBuilder`** driven by an `adapter` prop, shown
  only after an explicit edit/new action (server-persisted draft: *Salvar
  rascunho* / *Publicar* / *Descartar*, *Cancelar* returns to the read view); the
  local-draft mirror is disabled since the server holds it.
