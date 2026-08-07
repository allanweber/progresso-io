# Exercise catalog

A browsable catalog of exercises (musculação, cardio, alongamento, pliometria,
strongman, powerlifting e levantamento olímpico) for coaches and the platform
admin. It mirrors the food catalog: shared reference data with the same
base/custom tenancy shape, seeded at deploy time, read through the DAL and a
zod-validated JSON API, and rendered by client pages via TanStack Query.

## Data

The base catalog joins two open datasets that share the same exercise `id`
(873 rows each, a perfect 1:1 join) — see `drizzle/data/exercises-src/SOURCE.md`:

- **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)** (Unlicense /
  public domain) — the canonical English dataset; source of the stable enum
  values and the images.
- **[exercicios-bd-ptbr](https://github.com/joao-gugel/exercicios-bd-ptbr)** — the
  same rows with `name`/`instructions` translated to Brazilian Portuguese.

The transformer keeps the PT-BR text from the translation and normalized
snake_case enum slugs from free-exercise-db; the PT-BR labels for those enums
live in `src/lib/exercises.ts`.

### Pipeline

| Step | Command | Output |
| --- | --- | --- |
| 1. Build seed artifact | `npm run db:transform-exercises` | `drizzle/data/exercises-catalog.ndjson.gz` |
| 2. Build substitutions | `npm run db:build-exercise-substitutions` | `drizzle/data/exercise-substitutions.json` |
| (optional) Cache images locally | `npm run db:fetch-exercise-images` | `drizzle/data/exercises-images/<code>/<n>.jpg` (git-ignored) |

The images are **not** committed — 100 MB of binaries have no place in the repo
(and would bloat every Dokploy clone). They live only in the Cloudflare R2
bucket. The gzipped catalog and the substitutions JSON (a few hundred KB total)
are the only committed data.

Steps 1–3 are done once, in dev, and their outputs are committed. On deploy,
`scripts/migrate.mjs` runs automatically and, after applying migrations:

1. `seedExercises` loads the gzipped NDJSON into the `exercise` table,
   idempotently (no-ops once the table has rows).
2. `seedExerciseSubstitutions` loads `exercise-substitutions.json` into
   `exercise_substitution` as base rules (`clinic_id NULL`), resolving exercises
   by `code`. Idempotent (skips once any base rule exists).
3. `uploadExerciseImages` pushes the images to R2 — streaming each from the
   source CDN (or a local `drizzle/data/exercises-images/` folder if present).
   Automatic and idempotent (it skips once a full upload's manifest is present,
   and skips entirely when the `R2_*` env vars aren't set). No manual
   `npm run db:upload-exercise-images` is required (that script still exists for
   ad-hoc runs). A failed upload is non-fatal — the deploy continues and the app
   falls back to the source CDN for serving.

## Images

Exercise images live in the Cloudflare R2 bucket, never in the repo. The `exercise`
row stores relative keys (`<code>/0.jpg`); the client resolves them with
`exerciseImageUrl()` (`src/lib/exercises.ts`):

- Production points at the R2 custom domain via `NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL`.
- When that's unset (local dev), it falls back to the free-exercise-db CDN, which
  serves the same keys — so images load out of the box.

## Custom exercises

Both a **coach** and the **platform admin** can register new exercises, reusing
the same catalog shape as the seed:

- A **coach** creates a **clinic** exercise (`clinic_id = ctx.clinicId`), visible
  only to that clinic (alongside the base catalog). It can edit and archive its
  own; a base exercise is read-only for it.
- The **admin** creates a **base** exercise (`clinic_id NULL`), visible to every
  clinic, and **edits** base rows only. As a **moderation** action, though, the
  admin may **archive any** exercise — base *or* a clinic's own (`archiveAnyExercise`);
  editing a clinic exercise stays off-limits.

The tenant/origin is always derived from the session (coach ⇒ own clinic; admin
⇒ base) — **never** from the payload. The write path scopes every `UPDATE`/
archive by that discriminator, so a coach can never touch a base row and the
admin never touches a clinic row.

A registered exercise carries the same fields as the seed: up to **two images**,
a name, an optional description, category/level/force/mechanic/equipment, primary
and secondary muscles, the step-by-step execution, and substitutions. Per the
project rule, **only** the name, description and the execution steps are free
text; every other field is constrained to its enum (see the label maps in
`src/lib/exercises.ts`) and validated with the shared `exerciseFormSchema` zod
schema on both the coach and admin write routes.

Images are uploaded to R2 first — `POST /api/exercises/images` (coach) or
`POST /api/admin/exercises/images` (admin) accept one multipart file (JPG/PNG/
WEBP, ≤ 5 MB), store it under a `custom/<uuid>.<ext>` key in the same bucket the
seed images live in, and return the key; the form then saves those keys with the
exercise. `exerciseImageUrl()` resolves a `custom/…` key exactly like a seed key.
When R2 isn't configured (e.g. local dev), the upload route answers a friendly
503 and the exercise can still be saved without images (`description` is `text`,
nullable — the seeded base rows have none).

## Substitutions

`exercise_substitution` links an exercise to alternatives that train the same
muscle the same way — same base/custom shape as the rest of the catalog
(`clinic_id NULL` = base, set = a clinic's own). Unlike food substitutions there
is no `grams`; an exercise swap is a plain link.

The base rules are generated by `scripts/build-exercise-substitutions.mjs`:
exercises are grouped by **category + primary muscles + force + mechanic**, and
each gets up to **3** substitutes chosen to favor the most common gym equipment
(dumbbell, barbell, machine, cable, bodyweight), with a guarantee that a barbell
exercise always offers a dumbbell alternative and vice versa. The coach and
admin detail pages show an exercise's visible substitutes (base + the clinic's
own).

The **platform admin** can edit the **base** substitution rules from the admin
exercise detail page (`/admin/exercises/[id]`): add one by searching the catalog
and picking another exercise, or remove one with the trash button. To keep tenant
isolation intact, a base rule may only link two **base** exercises — the search
is restricted to `origin = base` and the DAL rejects any non-base id — so a base
rule can never expose a clinic's own exercise to other tenants.

A **coach** can add its own (clinic-scoped) substitution rules from the coach
exercise detail page, on any exercise it can see, and remove those it created —
but it can **never alter the base rules**: they render read-only (no delete), the
DAL stamps every coach rule with `ctx.clinicId`, and the delete is scoped by that
clinic, so a base rule is untouchable. Each substitute row carries a `removable`
flag (its own rule = true; an inherited base rule = false) that drives whether the
delete control shows. The coach's picker spans every exercise the clinic can see
(base + its own), since a clinic rule is private to that clinic and can't leak.

## Schema

One table, `exercise` (`src/db/schema.ts`), reference data with the same
base/custom discriminator as `food`:

- `clinic_id IS NULL` → shared base exercise; `clinic_id` set → a clinic's own
  custom exercise (created by a coach). Every read is scoped
  `clinic_id IS NULL OR clinic_id = ctx.clinicId`.
- `description` is a nullable free-text summary — NULL for the seeded base
  catalog, set by coaches/admin on a custom exercise (migration
  `0006_exercise_description`).
- Enums (`category`, `level`, `force`, `mechanic`, `equipment`, muscles) are
  stable English slugs; `name`/`instructions` are PT-BR. Muscles, instructions
  and image keys are stored as text arrays.
- `search_text = unaccent(lower(name))` backs a GIN trigram index for
  accent-/case-blind search, exactly like the food catalog.

## API

- Coach: `GET /api/exercises` (list) and `GET /api/exercises/[id]` (detail),
  tenant-scoped via `getTenantContext()` + the DAL, coach-only. Custom exercises
  are managed with `POST /api/exercises` (create), `PUT`/`DELETE
  /api/exercises/[id]` (edit / archive — own clinic rows only) and
  `POST /api/exercises/images` (image upload). Clinic substitutions are managed
  with `POST /api/exercises/[id]/substitutions` (add) and
  `DELETE /api/exercises/[id]/substitutions/[subId]` (remove) — the DAL stamps
  `ctx.clinicId` and scopes the delete by it, so base rules are never touched.
- Admin: `GET /api/admin/exercises` and `GET /api/admin/exercises/[id]`,
  cross-tenant, gated by `getAdminSession()`. Base exercises are managed with
  `POST /api/admin/exercises` (create base), `PUT`/`DELETE
  /api/admin/exercises/[id]` (edit / archive — base rows only) and
  `POST /api/admin/exercises/images`. Base substitutions are managed with
  `POST /api/admin/exercises/[id]/substitutions` (add) and
  `DELETE /api/admin/exercises/[id]/substitutions/[subId]` (remove) — admin-only,
  base-to-base.

All input is validated with zod before the DAL. Browsing is read-only for
alunos; a coach manages its own clinic exercises and substitutions, and the admin
manages the base ones. Favorites and workouts are future phases.

## UI

- Coach: the Exercícios tab of the Biblioteca — `/coach/library/exercises` (grid,
  with a "Novo exercício" action), `/coach/library/exercises/new` (create),
  `/coach/library/exercises/[id]` (detail, with edit/archive on its own exercise
  and the clinic substitution manager) and `/coach/library/exercises/[id]/edit`.
  The Biblioteca has two tabs, **Alimentos** (`/coach/library/foods`) and
  **Exercícios**, each a real route so a tab loads its data only when opened;
  `/coach/library` redirects to the default (Alimentos). The shared tab header is
  `LibraryTabs`.
- Admin: `/admin/exercises` (grid, with a "Novo exercício base" action),
  `/admin/exercises/new`, `/admin/exercises/[id]` and `/admin/exercises/[id]/edit`.
  In admin mode the catalog adds, right after the search box, an **origin** select
  (base e clínicas / somente base / somente de clínicas) and a **clinic** select,
  ahead of the category/muscle/equipment/level filters (all mirrored to the URL).

They reuse the shared client components `src/components/exercises/exercise-catalog.tsx`
(searchable, filterable card grid with URL-persisted filters and an optional
action slot), `exercise-detail.tsx` (image gallery, facets, description, step-by-
step instructions, plus edit/archive and the substitutions manager) and
`exercise-form.tsx` (the create/edit form, reused by both the coach and admin new
+ edit pages — endpoint-agnostic via `apiBase`/cache keys/redirect path). The
detail component takes a `manage` prop (`"base"` for the admin, `"clinic"` for the
coach) that turns the substitutions section into an add/remove manager for the
rows the viewer owns and shows the edit/archive controls on the viewer's own
exercise; everyone else sees it read-only.
