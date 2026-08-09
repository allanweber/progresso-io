# Student workouts (treino do aluno)

A **versioned, reference-based** workout assigned to one student — distinct from
the reusable template `workout` (see `docs/workouts.md`). It lives in the
**Treino** tab of the student profile (`/coach/students/[id]/workout`) and in the
aluno portal (`/student`, see `docs/student-portal.md`). It mirrors the student
**diet** feature (`docs/student-diets.md`) exactly, for exercises.

## Concepts

- A student accumulates a **history of workouts**, but only **one is `active`**
  at a time. Each workout is a named container with an incremental **version**
  chain (1..N).
- A coach builds a **draft** (invisible to the aluno) and **publishes** it; each
  publish numbers a new version. At most **one draft** exists per student at a
  time.
- Opening the tab lands on a **read view** (the active workout + history), never
  the builder — entered only by *Editar* / *Continuar editando* / *Nova ficha*.
- Starting a **new workout** (blank or copied from a template) creates a fresh
  draft; its **first publish** archives the previous active workout.
- Editing the active workout clones its latest version into a new draft version.

## Stored structure + live hydration (no snapshot)

Each version stores only the **prescription structure** as one `jsonb` document
(`WorkoutStructure`, `src/lib/student-workouts.ts`): per item the `exerciseId` +
`sets`/`reps`/`load`/`rest`/`technique`/`groupId`, plus the item's **custom
substitutes** (`exerciseId` + note). It stores **no** exercise names, images,
instructions or library substitutions.

On every read the DAL **hydrates** that structure against the current catalog
(`hydrateStructure`, `src/server/dal/student-workouts.ts`, reusing
`workout-hydrate`): it loads the referenced exercises live (name, images,
execution steps, muscles) and merges each item's custom substitutes with the
exercise's live **library** substitutes — with a **single joined query** over all
referenced exercise ids. So a coach's catalog correction reaches **every**
student immediately, with **no re-publish**. A `getStudentWorkoutState` read
hydrates the draft + current trees together (one catalog query for both). A
hard-deleted exercise shows an "Exercício indisponível" placeholder.

> **The one deliberate difference from diets:** a workout item keeps its per-item
> **custom substitutes** (cadastrados no treino), so those are stored in the
> structure; library substitutes are still derived live. (Diets store no per-item
> equivalences at all.)

## Schema

Two tables (`src/db/schema.ts`), migration `0011_workouts`:

- **`student_workout`** — `clinic_id` (tenant), `student_id`, `name`,
  `source_workout_id` (provenance to the copied template, `on delete set null`),
  `status` (`draft` | `active` | `archived`), timestamps.
- **`student_workout_version`** — `student_workout_id`, `version` (NULL while
  draft), `status` (`draft` | `published`), `tree` (`jsonb` = `WorkoutStructure`),
  `notes`, `published_at`, `published_by`, timestamps.
  `UNIQUE(student_workout_id, version)` (NULL drafts are distinct in Postgres).

## DAL (`src/server/dal/student-workouts.ts`)

Every function takes a `TenantContext` and scopes by `ctx.clinicId` +
`studentId`:

- `hydrateStructure` — the core read helper (stored structure → live session tree).
- `getStudentWorkoutState` — one read for the tab: the aluno-visible `current`,
  the in-flight `draft`, and the `history`.
- `getStudentWorkoutVersion` — a single published version, hydrated live.
- `createBlankDraft` / `createFromTemplate` — start a new workout (draft v1).
- `editActive` — open a draft of the active workout (copies its structure).
- `saveDraft` / `publishDraft` — save / number the version (exercises validated
  visible: `invalid_exercise`; publish requires ≥ 1 exercise: `empty`).
- `discardDraft` — delete the draft (removes a brand-new workout entirely).
- `saveAsTemplate` — export a version to the clinic's template catalog (reuses
  `workouts.createWorkout`).

A guard on any second draft returns `has_draft`.

## API (`/api/students/[id]/workout`)

All coach-only, zod-validated, tenant via `getTenantContext()` + the DAL:

- `GET /api/students/[id]/workout` — the tab state.
- `POST /api/students/[id]/workout` — start a draft; body
  `{ kind: "blank", name } | { kind: "template", workoutId, name? } | { kind: "edit" }`.
- `PUT /api/students/[id]/workout/draft` — save the draft (whole-tree
  `workoutFormSchema`).
- `POST /api/students/[id]/workout/draft/publish` — publish.
- `DELETE /api/students/[id]/workout/draft` — discard.
- `POST /api/students/[id]/workout/template` — save as a template (`{ versionId? }`).
- `GET /api/students/[id]/workout/versions/[versionId]` — a version's tree.

## UI

The student profile's **Treino** tab (`students/[id]/workout/page.tsx`, a client
component) drives the same state machine as the Dieta tab: empty → current (read
view + history + *Nova* / *Editar* / *Salvar como modelo*) → builder (the shared
**`WorkoutBuilder`** via its `adapter` prop: *Salvar rascunho* / *Publicar* /
*Descartar*). The read view reuses `WorkoutSessionsView` + the
`WorkoutExerciseDetail` dialog; history versions open read-only.
