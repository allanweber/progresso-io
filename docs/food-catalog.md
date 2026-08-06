# Food catalog (Bibliotecas)

The **Bibliotecas → Alimentos** area is a searchable Brazilian food-composition
catalog.

- **Phase 1 (read-only):** coaches browse the shared base catalog.
- **Phase 2 (clinic writes):** a clinic creates/edits/archives its own custom
  foods, manages substitution rules, and favorites foods. *(current)*
- **Phase 3:** super-admin curation of the base catalog + cross-clinic view.

## Data model

Six tables in `src/db/schema.ts`. The catalog is **reference data** — mostly
not tenant-scoped, the way `plan_limit` is:

| Table | Role |
| --- | --- |
| `food_group` | the 17 canonical TBCA groups (`name`, `slug`) |
| `nutrient` | the 40 canonical nutrients (`id` slug, `label`, `unit`, `kind`, `sort_order`) |
| `food` | one row per food; six **hot macros denormalized** + `search_text` + nullable `clinic_id` + `archived` + `needs_review` |
| `food_nutrient` | full per-100 g profile (`value` nullable, `is_trace`), PK `(food_id, nutrient_id)` |
| `food_substitution` | directed edge `grams` of substitute ≡ 100 g of food; nullable `clinic_id` |
| `food_favorite` | a clinic's favorited foods — PK `(clinic_id, food_id)`, **always** tenant-scoped (no base favorites) |

**Tenancy.** A `food` / `food_substitution` row with `clinic_id = NULL` is the
shared base (TBCA); a row with `clinic_id` set is one clinic's own. The DAL reads
`clinic_id IS NULL OR clinic_id = ctx.clinicId` and only ever writes custom rows
with `ctx.clinicId`, so the written-in-stone tenancy rule still holds even though
the base rows are global. Every **write** (create/update/archive a food, add/
remove a substitution) scopes its `WHERE` by `ctx.clinicId`, so a clinic can only
ever touch its own custom rows — base rows stay read-only. `food_favorite` is the
one always-tenant-scoped catalog table: a favorite belongs to exactly one clinic,
but the favorited food may be a base food or the clinic's own.

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

All coach-only (alunos have no access; super admin lands in phase 3). Every
handler validates its input with zod and derives the tenant via `getTenantContext`
+ the DAL.

Reads:
- `GET /api/foods` — list (search / group / type / **favorite** / sort /
  pagination), `GET /api/foods/groups`, `GET /api/foods/[id]` (detail DTO that
  never leaks internal columns).

Writes (phase 2):
- `POST /api/foods` — create a custom food; `PUT` / `DELETE /api/foods/[id]` —
  edit / archive it (only the clinic's own; a base id is a 404).
- `POST /api/foods/[id]/substitutions`, `DELETE …/[subId]` — add / remove a
  clinic-owned substitution rule.
- `PUT` / `DELETE /api/foods/[id]/favorite` — mark / unmark the clinic's favorite.

Pages:
- `/coach/library` — the Alimentos tab: debounced search, group/type filters, a
  **Favoritos** toggle, a per-row **star** (favorite), sortable macro columns,
  classic 25/page pagination, base/própria + type chips, "Novo alimento" action,
  mobile cards / desktop table.
- `/coach/library/foods/new` and `/coach/library/foods/[id]/edit` — the "enxuto"
  custom-food form (six hot macros), shared by create + edit (`FoodForm`).
- `/coach/library/foods/[id]` — detail: favorite star, hot macros, full profile
  (base foods) grouped by kind, edit/archive for the clinic's own food, and
  substitution management (inline food-search picker + grams, remove own rules).

## How it's wired

- `src/db/schema.ts` — the six tables.
- `drizzle/0001_food_catalog.sql` — catalog tables + extensions + trigram index;
  `drizzle/0002_food_favorite.sql` — the favorites table.
- `scripts/transform-catalog.mjs` / `drizzle/data/food-catalog.ndjson.gz` — the artifact.
- `scripts/migrate.mjs` — migrations + idempotent catalog seed.
- `src/server/dal/foods.ts` — tenant-scoped reads, search, and writes.
- `src/lib/foods.ts` — client-safe DTOs + the query/form zod schemas.
- `src/app/api/foods/*` — the route handlers.
- `src/components/foods/*` — `FoodForm` (create/edit) and `FavoriteButton`.
- `src/app/coach/library/*` — the pages.
