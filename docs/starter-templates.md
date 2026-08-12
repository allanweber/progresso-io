# Starter templates (anamneses · diets · workouts)

Every clinic starts with a curated set of ready-made **templates** its coaches can
use and edit: intake **anamneses**, meal-plan **diets**, and training **workouts**.
They are authored once as JSON, copied per-clinic, seeded in the background on the
coach's first sign-in, and managed by platform admins on the **Manutenção** page.

## The model: per-clinic copies, not shared base rows

A starter is **copied into each clinic** as a normal clinic-owned row
(`clinic_id = <clinic>`), which the clinic then owns and edits freely — exactly
like the anamnese starters that predate this feature. The `diet`/`workout`
`clinic_id = NULL` "base template" layer is **not** used here.

Provenance + idempotency ride on a `source_key` column (the starter's key, e.g.
`"hipertrofia"`, `"bro-split-5x"`). A partial unique index
`(clinic_id, source_key) where source_key is not null` guarantees a clinic can
hold at most one copy of a given starter, so seeding/importing is idempotent. A
row with `source_key` set is shown as **Sistema** in the admin; `null` (coach-
authored) is **Clínica**.

## Authoring: JSON + a slug vocabulary

The single source of truth is the JSON files:

- `drizzle/data/diets/*.json` — 13 diets, covering diverse objectives
  (emagrecimento, hipertrofia, manutenção, low-carb, cetogênica, reeducação,
  vegetariana, recomposição, econômica, vegana, diabético/metabólica, ganho de
  peso, jejum intermitente).
- `drizzle/data/workouts/*.json` — 11 workouts spanning beginner→expert and
  every technique in `WORKOUT_TECHNIQUES` (dropset, tripledrop, superset, giant,
  gvt, fs7, restpause, cluster).

They are loaded into `STARTER_DIETS` / `STARTER_WORKOUTS`
(`src/server/{diets,workouts}/starter-templates.ts`), the diet/workout analogue
of `STARTER_ANAMNESES`.

### Why slugs, not ids

A `food`/`exercise` id is generated per database, so a starter can't embed catalog
UUIDs — one authored against a given seed would dangle in another. Instead a
starter references a catalog item by a **stable slug** (`"frango"`,
`"supino_barra"`). `src/server/starters/vocab.ts` maps each slug to a
case-insensitive regex, and `loadStarterResolver` (`resolve.ts`) matches it
against the **base** catalog at seed/import time, picking the **shortest** match —
the same "plainest food/exercise" rule the dev seed uses. The base catalog is
loaded once per resolver, so seeding all 24 starters costs two catalog queries.

The **resolution guard test** (`tests/starter-resolution.test.ts`) asserts, against
the real seed artifacts (no database), that every vocabulary slug and every slug
used by a starter resolves — so a typo or a catalog rename fails CI instead of
silently producing an empty template in a clinic.

## Delivery: one background seed on first sign-in

Sign-up creates only the clinic + owner — it seeds **no** starters, so it stays
fast. All three domains are seeded together, once, in the background:

- The coach's first landing on `/coach/**` fires
  `POST /api/clinic/starters/ensure` from a small client island
  (`starters-ensure.tsx`), which shows a "Preparando seus modelos…" banner while
  it runs and refetches the library when it completes.
- The `/coach` layout reads `clinic.starters_seeded_at` and passes the flag to
  the island, so once seeded the client makes **zero** calls.

### Exactly-once guarantee

`ensureClinicStarters` (`src/server/dal/starters.ts`) runs at most once per clinic:

1. **Fast path** — reads `clinic.starters_seeded_at`; if set, returns immediately.
2. **Claim** — takes a transaction-scoped Postgres advisory lock keyed by the
   clinic id, so concurrent first-load calls for the same clinic serialize.
3. **Double-check** — re-reads the flag inside the lock; a queued caller no-ops.
4. **Seed + flag** — seeds anamneses + diets + workouts and sets
   `starters_seeded_at` in the **same transaction**, so a crash rolls everything
   back (flag stays null → the next call redoes it) and the per-domain inserts are
   idempotent by `source_key` regardless.

The flag is a durable **DB column**, not client/session state, so a coach signing
in from a new device never re-seeds.

## Admin management (Manutenção)

`/admin/maintenance` gains **Dietas** and **Treinos** tabs mirroring the Anamneses
tab (`TemplateMaintenance`): a cross-clinic list (filter by clinic / origin
Sistema-vs-Clínica / search) with each template's student-usage count, hard-delete
of any clinic's template, and an **Importar starters** dialog to copy selected
system starters into a chosen clinic (idempotent by `source_key`).

Backing routes (all `getAdminSession` + zod):

- `GET /api/admin/{diets,workouts}` — cross-clinic list.
- `DELETE /api/admin/{diets,workouts}/[id]` — hard-delete (student copies keep
  their own versioned tree; only `source_*_id` nulls).
- `GET /api/admin/{diets,workouts}/starters` — the starter set for the dialog.
- `POST /api/admin/{diets,workouts}/import` — import selected keys into a clinic.

## Nutrition / exercise data stays live

Nothing about a diet's nutrition or a workout's exercise presentation is frozen
into the starter copy — diets store food references and compute macros live, and
workouts store exercise references and hydrate name/images/instructions live. A
starter is just structure; a later catalog correction propagates to the copies
with no re-seed.

## Trade-offs

- **Catalog dependency.** A starter referencing a food/exercise missing from the
  base catalog has that item dropped (a whole template is skipped only if nothing
  resolves). The resolution guard keeps this from happening silently.
- **Volume.** 13 diets + 11 workouts + the anamneses are copied into every clinic.
  The background-on-first-sign-in seed keeps that off the sign-up path.
