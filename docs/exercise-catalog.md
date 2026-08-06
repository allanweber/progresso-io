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
| 2. Fetch images locally | `npm run db:fetch-exercise-images` | `drizzle/data/exercises-images/<code>/<n>.jpg` |
| 3. Upload images to R2 | `npm run db:upload-exercise-images` | Cloudflare R2 bucket |

The seed itself (`scripts/migrate.mjs → seedExercises`) loads the gzipped NDJSON
into the `exercise` table on deploy, idempotently (it no-ops once the table has
rows). The images are versioned in the repo so the seed is self-contained.

## Schema

One table, `exercise` (`src/db/schema.ts`), reference data with the same
base/custom discriminator as `food`:

- `clinic_id IS NULL` → shared base exercise; `clinic_id` set → a clinic's own
  custom exercise (a later phase). Every read is scoped
  `clinic_id IS NULL OR clinic_id = ctx.clinicId`.
- Enums (`category`, `level`, `force`, `mechanic`, `equipment`, muscles) are
  stable English slugs; `name`/`instructions` are PT-BR. Muscles, instructions
  and image keys are stored as text arrays.
- `search_text = unaccent(lower(name))` backs a GIN trigram index for
  accent-/case-blind search, exactly like the food catalog.

## Images

The `exercise` row stores relative image keys (`<code>/0.jpg`). The client
resolves them to a URL with `exerciseImageUrl()` (`src/lib/exercises.ts`):

- Production points at the Cloudflare R2 custom domain via
  `NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL`.
- When that's unset (local dev), it falls back to the free-exercise-db CDN, which
  serves the same keys — so images load out of the box.

## API

- Coach: `GET /api/exercises` (list) and `GET /api/exercises/[id]` (detail),
  tenant-scoped via `getTenantContext()` + the DAL, coach-only.
- Admin: `GET /api/admin/exercises` and `GET /api/admin/exercises/[id]`,
  cross-tenant, gated by `getAdminSession()`.

All query input is validated with zod before the DAL. This first delivery is
read-only (browse); custom exercises, favorites and workouts are future phases.

## UI

- Coach: `/coach/library/exercises` (grid) and `/coach/library/exercises/[id]`.
- Admin: `/admin/exercises` and `/admin/exercises/[id]`.

Both reuse the shared client components `src/components/exercises/exercise-catalog.tsx`
(searchable, filterable card grid with URL-persisted filters) and
`exercise-detail.tsx` (image gallery, facets, step-by-step instructions).
