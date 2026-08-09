# Student portal (portal do aluno)

The **aluno-facing** app at `/student` — where a student sees what their coach
publishes. The responsive shell (chrome + tab nav) ships with the **Dieta** and
**Treino** tabs wired to real data; Check-in and Evolução remain "em breve"
placeholders until those features exist.

The aluno is **read-only** by nature: they never edit, and they only ever see
what has been **published** — a coach's in-flight **draft is invisible** here
(see `docs/student-diets.md` for the coach side).

## Access boundary (written into the DAL)

Everything the portal reads goes through `src/server/dal/student-portal.ts`,
which is **doubly scoped**: by `ctx.clinicId` (the tenant) AND by the student
row that belongs to the authenticated user (`students.userId = ctx.userId`).

- The aluno **never supplies a `studentId`** — it is resolved from the session
  (`ownStudentId`), so it is impossible to read another student's data.
- Only **`published`** versions are ever selected — drafts are never loaded
  (unlike the coach's `getStudentDietState`).
- `getMyProfile` — name, coach, clinic and goal for the chrome.
- `getMyDietState` — `{ current, history }` (no `draft` field exists on the DTO).
- `getMyDietVersion` — one published version's tree, own-student + published only.
- `getMyWorkoutState` / `getMyWorkoutVersion` — the same, for the active published
  workout (see `docs/student-workouts.md`).

A user with no linked student (a coach/admin, or an aluno not yet linked) gets
`null`, which the API turns into a 404.

## API (`/api/student/*`)

All **aluno-only** (`getTenantContext()` + `role === "aluno"`), tenant via the
DAL, zod on the only param:

- `GET /api/student/profile` — the chrome identity.
- `GET /api/student/diet` — the active published diet + read-only history.
- `GET /api/student/diet/versions/[versionId]` — a published version's tree.
- `GET /api/student/workout` — the active published workout + read-only history.
- `GET /api/student/workout/versions/[versionId]` — a published version's tree.

## UI (`/student`)

- `student/layout.tsx` — server component, `requireRole(["aluno"])` (defense in
  depth). The chrome and sign-out live in the page.
- `student/page.tsx` — a `"use client"` component reading through the API +
  TanStack Query. **One responsive page** renders both designs:
  - **Desktop** (`lg+`): top bar + a sticky left **sidebar** (profile card +
    vertical nav) + content.
  - **Mobile**: a green **header** (greeting + goal badge) + content + a fixed
    **bottom tab bar**.
  - Tab state is **local** (the portal is one screen; only Dieta is live), so
    tabs aren't deep-linked. Sign-out clears the TanStack cache
    (`queryClient.clear()`) so no data survives into the next account.
- **Dieta tab**: a total macro bar (+ P/C/G ratio), then meal cards (per-meal
  macro footer, reusing `MacroSummary` from the coach's `diet-detail-view`).
  Each food row shows a small "N substituições" indicator and is **clickable** →
  a **food-detail dialog** (macro cards + distribution bar + the full,
  portion-scaled swap list). Nutrition + substitutions are hydrated **live** from
  the catalog on read (see `docs/student-diets.md`), not snapshotted. Food avatars
  from the design are intentionally omitted.
- **Dietas anteriores**: a flat, **read-only** list of past published versions
  (archived diets + older versions of the active one); opening one shows its
  meals → foods as a plain read (`somente leitura`), with no food dialog.

## Tests

- **Integration** (`tests/student-portal.integration.test.ts`, PGlite): the
  aluno sees their own published current + history; **never** a draft; **never**
  another aluno's/clinic's diet; a version resolves only if published; an
  unlinked user gets `null`.
- **e2e** (`e2e/student.spec.ts`, real Postgres): the seed publishes an active
  "Cutting" diet + an archived "Adaptação" one for `aluno@progresso.io`; the
  spec covers the diet render, the food dialog, the history read, and the mobile
  chrome. Auth is the `student` Playwright project (saved aluno session).
