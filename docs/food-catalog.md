# Food catalog (Bibliotecas)

The **Bibliotecas → Alimentos** area is a searchable Brazilian food-composition
catalog. Phase 1 is read-only: coaches browse the base catalog. Later phases add
clinic-owned custom foods, substitution management, and super-admin curation.

## Data model

Five tables in `src/db/schema.ts`. The catalog is **reference data** — mostly
not tenant-scoped, the way `plan_limit` is:

| Table | Role |
| --- | --- |
| `food_group` | the 17 canonical TBCA groups (`name`, `slug`) |
| `nutrient` | the 40 canonical nutrients (`id` slug, `label`, `unit`, `kind`, `sort_order`) |
| `food` | one row per food; six **hot macros denormalized** + `search_text` + nullable `clinic_id` + `archived` + `needs_review` |
| `food_nutrient` | full per-100 g profile (`value` nullable, `is_trace`), PK `(food_id, nutrient_id)` |
| `food_substitution` | directed edge `grams` of substitute ≡ 100 g of food; nullable `clinic_id` |

**Tenancy.** A `food` / `food_substitution` row with `clinic_id = NULL` is the
shared base (TBCA); a row with `clinic_id` set is one clinic's own. The DAL reads
`clinic_id IS NULL OR clinic_id = ctx.clinicId` and only ever writes custom rows
with `ctx.clinicId`, so the written-in-stone tenancy rule still holds even though
the base rows are global.

## Source data & the seed

The raw TBCA dump lives at `alimentos.json` (a stream of concatenated JSON
objects, ~5 668 foods). Two steps turn it into the running catalog:

1. **Transform** (`npm run db:transform-catalog`, dev-time) —
   `scripts/transform-catalog.mjs` normalizes it into a compact
   `drizzle/data/food-catalog.ndjson.gz` (~0.95 MB), applying:
   - decimal comma → number; `NA`/`-` → `null` (unmeasured); `tr` → `null` + `is_trace`
   - 41 source `Componente|Unidade` pairs → 40 canonical nutrient ids
     (cholesterol is always mg — the `g` unit in the source is a mislabel)
   - duplicate nutrient rows per food deduped (a few foods carry a doubled profile)
   - TBCA classes merged into 17 canonical groups (case/accent variants folded)
   - `ingrediente` / `preparacao` derived heuristically from the description
   - the six hot macros (kcal, protein, carb, fat, fiber, sodium) denormalized
   - foods sharing an identical description flagged `needs_review` (24 groups)

2. **Seed** (`scripts/migrate.mjs`, at deploy) — after the migrations apply, the
   same job loads the gz into the empty tables. **Idempotent**: it skips once
   `food` has rows, so every deploy is safe. `search_text` is computed as
   `unaccent(lower(description))`. No shell needed — the compose `migrate`
   service runs it and the app waits for it.

## Search

Search is server-side and accent-/case-insensitive. `search_text` is the
unaccented, lowercased description; the migration creates the `pg_trgm` and
`unaccent` extensions and a **GIN trigram index** on it. The DAL matches each
whitespace token with `LIKE '%' || unaccent(lower(token)) || '%'` and ranks by
`similarity()`. (Confirmed installable on the target Postgres 18.4.)

## API & UI

- `GET /api/foods` — list (zod-validated search / group / type / sort /
  pagination), `GET /api/foods/groups`, `GET /api/foods/[id]` (detail, shaped to
  a DTO that never leaks internal columns). Coach-only in phase 1.
- `/coach/library` — the Alimentos tab: debounced search, group/type filters,
  sortable macro columns, classic 25/page pagination (TanStack Query + Table),
  base/própria + type chips, mobile cards / desktop table.
- `/coach/library/foods/[id]` — read-only detail: hot macros, full profile
  grouped by nutrient kind, and the clinic's visible substitutes.

## How it's wired

- `src/db/schema.ts` — the five tables.
- `drizzle/0001_food_catalog.sql` — tables + extensions + trigram index.
- `scripts/transform-catalog.mjs` / `drizzle/data/food-catalog.ndjson.gz` — the artifact.
- `scripts/migrate.mjs` — migrations + idempotent catalog seed.
- `src/server/dal/foods.ts` — tenant-scoped reads and search.
- `src/lib/foods.ts` — client-safe DTOs + the query zod schema.
- `src/app/api/foods/*` — the route handlers.
- `src/app/coach/library/*` — the pages.
