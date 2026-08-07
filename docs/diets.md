# Diets (dietas)

Coach-authored meal plans. A **diet** groups **meals** (refeições), each holding
**food items** (alimento + grams), and each item may offer **equivalences**
(substitute foods with equivalent grams). Diets are generic, reusable templates
in this phase; assigning one to a student — with versioned history — is a later
phase and will **snapshot** the diet (so a student's history never changes when a
template is edited), which is why there is deliberately no student link on the
diet here.

Only a **coach** creates diets. It mirrors the rest of the catalog: the same
base/custom tenancy shape, read through the DAL and a zod-validated JSON API, and
rendered by client pages via TanStack Query.

## Tenancy

Diets follow the catalog's base/custom shape (like `food`/`exercise`):

- `clinic_id IS NULL` → a shared **base/template** diet, reserved for a future
  platform/admin catalog (not created in this phase).
- `clinic_id` set → a **clinic's own** diet, authored by a coach (`coach_id`).

Every read is scoped `clinic_id IS NULL OR clinic_id = ctx.clinicId`, so a clinic
sees the base templates plus only its own diets. Every write stamps
`ctx.clinicId` (and `ctx.userId` as the author) and scopes its `WHERE` by
`clinic_id = ctx.clinicId`, so a coach can only ever touch its own diets — a base
template is read-only. The `clinicId`/`coachId` are always derived from the
session, **never** from the payload.

## Nutrition (computed, never stored)

kcal/macros are **not** persisted. Per-item, per-meal and diet-wide totals are
computed at read time from the referenced `food` rows (a live reference,
`per 100 g × grams / 100`). Editing a base food later is reflected everywhere it
is used. The client builder keeps each food's per-100 g macros in memory so the
totals stay live while editing (on save only `foodId` + `grams` are sent).

## Schema

Four tables (`src/db/schema.ts`), migration `0007_diets`:

- **`diet`** — `clinic_id` (nullable), `coach_id` (nullable), `name`, `notes`
  (nullable), `archived` (soft-delete), timestamps.
- **`diet_meal`** — `diet_id`, `name` (free text), `time` (nullable free text),
  `position`.
- **`diet_meal_item`** — `diet_meal_id`, `food_id` (→ `food`, `on delete
  restrict`), `grams` (> 0), `position`.
- **`diet_meal_item_substitute`** — `diet_meal_item_id`, `food_id`, `grams`
  (> 0), `position`. A coach-defined equivalence, independent of the catalog's
  `food_substitution` (those only pre-suggest options in the UI).

The child tables carry no `clinic_id`; they inherit tenancy through their FK to
`diet` (the DAL scopes by the parent diet). Deleting a diet cascades to the whole
tree.

## DAL (`src/server/dal/diets.ts`)

Every function takes a `TenantContext` and scopes by `ctx.clinicId`:

- `listDiets` — tenant-scoped page with search (accent/case-blind on `name`), an
  `includeArchived` flag, and per-row meal/item counts + total kcal (correlated
  subqueries). Ordered by most recently updated.
- `getDiet` — the full tree (meals → items → substitutes) with computed macros
  and totals, or null when not visible.
- `createDiet` / `updateDiet` — validate that **every referenced food is visible
  to the clinic** (base or own), then write the **whole tree in a transaction**
  (create stamps `clinicId`/`coachId`; update replaces the tree by deleting the
  meals — cascading to items/substitutes — and re-inserting from the payload).
  Return `invalid_food` / `not_found` on the failure paths.
- `archiveDiet` / `unarchiveDiet` — soft-delete toggles, scoped to the clinic's
  own diets (a base/other-clinic id is never matched).

## API (`/api/diets`)

All coach-only, zod-validated, tenant via `getTenantContext()` + the DAL:

- `GET /api/diets` — listing (search / `includeArchived` / pagination).
- `POST /api/diets` — create (whole-tree payload).
- `GET /api/diets/[id]` — full detail.
- `PUT /api/diets/[id]` — replace the whole tree.
- `DELETE /api/diets/[id]` — archive. `PATCH /api/diets/[id]` — unarchive.

The write payload is the whole tree, validated by the shared `dietFormSchema`
(`src/lib/diets.ts`):

```jsonc
{
  "name": "Cutting 1800",
  "notes": "Beber água",
  "meals": [
    {
      "name": "Café da manhã",
      "time": "08:00",
      "items": [
        { "foodId": "…", "grams": 200,
          "substitutes": [{ "foodId": "…", "grams": 120 }] }
      ]
    }
  ]
}
```

## UI

A **Dietas** entry in the coach sidebar. Routes (English segments, PT-BR copy):

- `/coach/diets` — card list with search + an archived filter (name, meal/item
  counts, total kcal, updated-at).
- `/coach/diets/new` — the builder (create).
- `/coach/diets/[id]` — read-only view (meals, items, equivalences, per-meal and
  diet totals) with **Editar** / **Arquivar** / **Desarquivar** for the clinic's
  own diets (a base template is read-only).
- `/coach/diets/[id]/edit` — the builder (edit).

### Builder (`src/components/diets/diet-builder.tsx`)

Per the frontend rules, the scalar shell (`name`, `notes`) uses **TanStack Form**
(validated by zod); the nested tree (meals → items → equivalences) is component
state with **drag-and-drop reordering** (`@dnd-kit`) for meals and items. Meal
names are free text with prominent suggestion chips (Café da manhã, Lanche da
manhã, Almoço, Lanche da tarde, Jantar, Ceia, Pré-treino). Totals update live.

The whole tree is saved in a single `POST`/`PUT`. While editing, the draft is
**persisted to `localStorage`** (recovered on return, discardable), and a
**beforeunload guard** warns before leaving with unsaved changes.

### FoodPicker (`src/components/foods/food-picker.tsx`)

A **reusable** food search-and-select, styled after the "Adicionar alimento"
mockup: type to search the catalog (`/api/foods`, base + the clinic's own),
navigate with ↑/↓, Enter to select, Esc to close. With `withQuantity` it adds the
grams step (scaled macros preview) and emits `{ foodId, grams }`; without it, it
just emits the picked food. It is domain-agnostic — the diet builder uses it both
to add an item and to add an equivalence, where the item food's catalog
substitutes (`food_substitution`) are surfaced as quick suggestion chips.
