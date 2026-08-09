# Workouts (treinos)

A **workout** is a coach-authored, reusable training-program template — the
exercise analogue of a `diet` (see `docs/diets.md`). It lives at
`/coach/workouts` ("Programas de treino"). Assigning one to a student produces a
versioned `student_workout` (see `docs/student-workouts.md`).

## Concepts

- A workout has **sessions** ("fichas", e.g. "Ficha A · Peito e Tríceps"), each
  with ordered **exercises**. An exercise references the shared **exercise
  catalog** (`docs/exercises.md`) plus its prescription.
- A prescription is: `sets` (int), `reps` (**número** / **intervalo** /
  **pirâmide** / **falha**), optional `load` (free text — "40 kg", "peso
  corporal", "70% 1RM"), `rest` in seconds (**default 01:30**, `0` = no rest),
  and an optional free-text **observação** (`note`, ≤280 chars) shown to the aluno.
  The **intervalo** and **pirâmide** kinds are both a **sequence of 2+ values**,
  crescente ou decrescente (e.g. `8-12`, or `12-10-8-6`) — stored as
  `{ kind: "range" | "pyramid", values: number[] }`; a **pirâmide** additionally
  signals that the load rises each set (the reps typically fall).
- An exercise may carry an **advanced technique** (`technique`): drop set, triple
  drop, super set, giant set, GVT, FS7, rest-pause, cluster. The technique's
  label/icon/**explanation** is static app content (`src/lib/workout-techniques.ts`),
  keyed by the enum — never stored per workout. Grouping techniques (super set /
  giant set) **chain forward**: marking an exercise links it — without rest —
  into the **following** exercise, so a pair only needs its first item marked. The
  block extends while consecutive items carry the same grouping technique and
  closes on the first that doesn't (its tail). The builder assigns the shared
  `group_id` (`assignGroupIds`, `src/lib/workout-grouping.ts`); the read views
  draw the block as a continuous rail.
- An exercise may have **custom substitutes** cadastrados no treino (a catalog
  exercise + optional note). These are stored on the item; the exercise's
  **library** substitutes (`exercise_substitution`) are merged in **live** on read.

## Live reference (no snapshot)

Like diets, a workout stores only the **prescription** — which exercise +
sets/reps/load/rest/technique/grouping + custom substitutes. The exercise's
**name, images, execution steps, muscles and library substitutes are never
stored**: they are hydrated live from the catalog on every read
(`src/server/dal/workout-hydrate.ts`), so a coach's catalog correction (an
exercise's images, instructions, or a new library substitution) reaches every
workout — and every assigned student — with **no re-save**. A hard-deleted
exercise shows an "Exercício indisponível" placeholder.

Hydration is a **single joined SQL query**: `exercise LEFT JOIN
exercise_substitution LEFT JOIN exercise (the substitute)`, over every referenced
exercise id at once, scoped to the clinic (base + own). Custom substitutes are
merged from the stored data (they win over a library sub for the same exercise).

## Schema

Tables (`src/db/schema.ts`), migration `0011_workouts`:

- **`workout`** — `clinic_id` (NULL = a future base template), `coach_id`,
  `name`, `notes`, `archived`, timestamps.
- **`workout_session`** — `workout_id`, `name`, `position`.
- **`workout_exercise`** — `workout_session_id`, `exercise_id` (`on delete
  restrict`), `sets`, `reps` (`jsonb`), `load`, `rest` (default 90), `technique`,
  `note` (free-text observação, ≤280 chars), `group_id`, `position`.
- **`workout_exercise_substitute`** — `workout_exercise_id`,
  `substitute_exercise_id`, `note`, `position`.

The child tables inherit tenancy through their FK to `workout`.

## DAL (`src/server/dal/workouts.ts`)

Every read is scoped to `clinic_id IS NULL OR clinic_id = ctx.clinicId`; writes
stamp `ctx.clinicId`/`ctx.userId`:

- `listWorkouts` — a page with session/exercise counts.
- `getWorkout` — the full hydrated tree (sessions → exercises + merged subs).
- `createWorkout` / `updateWorkout` — validate every referenced exercise is
  visible (`invalid_exercise`) and store the tree.
- `copyWorkout` — an exact copy named "<name> (cópia)" (custom subs duplicated;
  library subs stay live).
- `archiveWorkout` / `unarchiveWorkout` (soft-delete).
- `deleteWorkout` — hard delete, only when **archived** and **not referenced** by
  a `student_workout.source_workout_id` (`not_archived` / `in_use`).

## API (`/api/workouts`)

All coach-only, zod-validated, tenant via `getTenantContext()` + the DAL:

- `GET /api/workouts` — the listing.
- `POST /api/workouts` — create (whole tree, `workoutFormSchema`).
- `GET/PUT/DELETE/PATCH /api/workouts/[id]` — detail / update / archive /
  unarchive.
- `POST /api/workouts/[id]/copy` — "Criar cópia".

## UI

- `/coach/workouts` — the list; `new` and `[id]/edit` drive the reusable
  **`WorkoutBuilder`** (`src/components/workouts/workout-builder.tsx`): sessions →
  exercises with drag-reorder (`@dnd-kit`), the exercise search + prescription
  panel (`ExercisePicker`), a technique select, super-set/giant grouping (derived
  from consecutive same-technique runs), and a per-item custom-substitute picker.
- `/coach/workouts/[id]` — the read view (`WorkoutSessionsView`), with **Criar
  cópia** / **Editar** / **Arquivar**. In the full view each exercise shows its
  prescription, the technique badge, a **continuous super-set/giant rail with a
  technique-icon node** beside each grouped exercise, and only a **substitution
  count** indicator; the **full substitution list** (and the image carousel,
  técnica explanation, execution cues, muscles) lives in the
  **`WorkoutExerciseDetail`** dialog. All pages are `"use client"` and talk to the
  API via TanStack Query.
