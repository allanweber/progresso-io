# Food catalog (Bibliotecas)

The **Bibliotecas → Alimentos** area is a searchable Brazilian food-composition
catalog.

- **Phase 1 (read-only):** coaches browse the shared base catalog.
- **Phase 2 (clinic writes):** a clinic creates/edits/archives its own custom
  foods, manages substitution rules, and favorites foods.
- **Phase 3 (super admin):** the platform admin curates the shared **base**
  catalog (create/edit/archive base foods, manage base substitutions) and has a
  read-only **cross-clinic view** of every clinic's own foods. *(current)*

## Data model

Six tables in `src/db/schema.ts`. The catalog is **reference data** — mostly
not tenant-scoped, the way `plan_limit` is:

| Table | Role |
| --- | --- |
| `food_group` | the 15 canonical TACO groups (`name`, `slug`) |
| `nutrient` | the 66 canonical nutrients (`id` slug, `label`, `unit`, `kind`, `sort_order`) |
| `food` | one row per food; six **hot macros denormalized** + `search_text` + nullable `clinic_id` + `archived` + `needs_review` |
| `food_nutrient` | full per-100 g profile (`value` nullable, `is_trace`), PK `(food_id, nutrient_id)` |
| `food_substitution` | directed edge `grams` of substitute ≡ 100 g of food; nullable `clinic_id` |
| `food_favorite` | a clinic's favorited foods — PK `(clinic_id, food_id)`, **always** tenant-scoped (no base favorites) |

**Tenancy.** A `food` / `food_substitution` row with `clinic_id = NULL` is the
shared base (TACO); a row with `clinic_id` set is one clinic's own. The DAL reads
`clinic_id IS NULL OR clinic_id = ctx.clinicId` and only ever writes custom rows
with `ctx.clinicId`, so the written-in-stone tenancy rule still holds even though
the base rows are global. Every **write** (create/update/archive a food, add/
remove a substitution) scopes its `WHERE` by `ctx.clinicId`, so a clinic can only
ever touch its own custom rows — base rows stay read-only. `food_favorite` is the
one always-tenant-scoped catalog table: a favorite belongs to exactly one clinic,
but the favorited food may be a base food or the clinic's own.

## Source data & the seed

The base catalog is the **Tabela Brasileira de Composição de Alimentos (TACO),
4ª edição — NEPA/UNICAMP (2011)**: **597 curated foods** (vs the ~5 668 of the
TBCA it replaced — far easier to search). The normalized source CSVs live in
`drizzle/data/taco-src/` (see its `SOURCE.md`; taken from the MIT-licensed
[`brolesi/taco`](https://github.com/brolesi/taco) pipeline). Two steps turn them
into the running catalog:

1. **Transform** (`npm run db:transform-taco`, dev-time) —
   `scripts/transform-taco.mjs` joins the three CSVs (composição centesimal,
   ácidos graxos, aminoácidos) into a compact `drizzle/data/taco-catalog.ndjson.gz`
   (~0.1 MB), applying:
   - empty cell → no `food_nutrient` row (unmeasured, read as null); `1e-05`
     (source sentinel for "Tr") → a row with `value = null` + `is_trace = true`
   - 66 canonical nutrients: proximates + 9 minerals + 8 vitamins (`energy`…),
     22 fatty acids (`fatty_acid`), 18 amino acids (`amino_acid`); values kept to
     4 significant figures (the source carries per-sample means with long tails)
   - the 15 TACO `categoria` values → canonical groups (accent-folded slugs)
   - `type` = `preparacao` for the "Alimentos preparados" group, else `ingrediente`
   - the six hot macros (kcal, protein, carb, fat, fiber, sodium) denormalized
   - foods sharing an identical description flagged `needs_review` (none in TACO)

2. **Seed** (`scripts/migrate.mjs`, at deploy) — after the migrations apply, the
   same job loads the gz into the empty tables. **Idempotent**: it skips once
   `food` has rows, so every deploy is safe. `search_text` is computed as
   `unaccent(lower(description))`. No shell needed — the compose `migrate`
   service runs it and the app waits for it.

3. **Supplement** (`drizzle/data/taco-supplement.json`, seeded right after the
   catalog) — ~75 common diet staples the TACO base lacks (peanut butter, whey,
   Greek yogurt, chia, tempeh, plant milks, seeds, alt-flours, fermented foods…),
   sourced from the **TBCA** (original code kept) and **USDA FoodData Central**
   (FDC id kept; brand-variable powders use a representative value). They become
   shared base foods reusing the existing groups/nutrients. This step is keyed by
   each food's unique `code` with `on conflict do nothing`, so it is independent
   of the catalog skip — it can top up a TACO-only database and re-runs safely.
   `source` records provenance (`TACO` / `TBCA` / `USDA`). Total base: 597 + 75
   = **672 foods**.

## Search

Search is server-side and accent-/case-insensitive. `search_text` is the
unaccented, lowercased description; the migration creates the `pg_trgm` and
`unaccent` extensions and a **GIN trigram index** on it. The DAL matches each
whitespace token with `LIKE '%' || unaccent(lower(token)) || '%'` and ranks by
`similarity()`. (Confirmed installable on the target Postgres 18.4.)

> **Switching from TBCA to TACO.** The seed is idempotent (skips when `food` has
> rows), so it never overwrites an already-seeded database. To move an existing
> deployment from the old TBCA catalog to TACO, empty the database first, then
> deploy — the `migrate` job seeds TACO into the fresh tables.

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

### Super admin (phase 3)

The platform admin (`role = "admin"`, no clinic) works cross-tenant through the
admin DAL (`src/server/dal/admin.ts`), gated at every route by `getAdminSession`.
It **sees** every food (base + all clinics) but only ever **writes** the base
(`clinic_id IS NULL`): create/edit/archive scope their WHERE to base rows, and
base substitutions are stamped `clinic_id = NULL`. A clinic's own food/rule is
read-only here.

- `GET /api/admin/foods` (search / group / type / **origin** / **clinic** /
  archived), `POST` (create base). `GET/PUT/DELETE /api/admin/foods/[id]` (read
  any; edit/archive base). `POST` + `DELETE …/substitutions/[subId]` (base
  rules). `GET /api/admin/foods/groups`.
- `/admin/foods` — cross-clinic listing with origin + clinic filters and a
  "Novo alimento base" action; `/admin/foods/new`, `/admin/foods/[id]`,
  `/admin/foods/[id]/edit`. The `FoodForm` component is reused, parameterized by
  `apiBase` / cache keys / redirect path.

## How it's wired

- `src/db/schema.ts` — the six tables.
- `drizzle/0001_food_catalog.sql` — catalog tables + extensions + trigram index;
  `drizzle/0002_food_favorite.sql` — the favorites table;
  `drizzle/0003_taco_source_default.sql` — `food.source` default → `TACO`.
- `drizzle/data/taco-src/*.csv` (source) → `scripts/transform-taco.mjs` →
  `drizzle/data/taco-catalog.ndjson.gz` (the seed artifact).
- `drizzle/data/taco-supplement.json` — the TBCA/USDA base-catalog supplement.
- `scripts/migrate.mjs` — migrations + idempotent catalog & supplement seed.
- `src/server/dal/foods.ts` — tenant-scoped (coach) reads, search, and writes;
  `src/server/dal/admin.ts` — the cross-tenant admin foods DAL (base CRUD).
- `src/lib/foods.ts` / `src/lib/admin.ts` — client-safe DTOs + zod schemas.
- `src/app/api/foods/*` and `src/app/api/admin/foods/*` — the route handlers.
- `src/components/foods/*` — `FoodForm` (create/edit, endpoint-agnostic) and
  `FavoriteButton`.
- `src/app/coach/library/*` and `src/app/admin/foods/*` — the pages.
