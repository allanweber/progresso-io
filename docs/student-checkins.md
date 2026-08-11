# Student check-ins (Check-in + Evolução)

The aluno's weekly progress submission, in the portal at `/student` — the
**Check-in** tab (submit) and the **Evolução** tab (weight chart + history). The
clinic is the tenant, so every row carries `clinic_id` and every query is scoped
by it; the aluno is always resolved from the **session** (never a client id).

## What a check-in is

A dated progress entry for a student: a body **weight**, an optional **note**,
and **four physique photos** (poses). The `author` column discriminates who
logged it:

- `student` — submitted by the aluno from the portal (weight + all four poses
  required; note optional).
- `coach` — a coach recording an **in-person** check-in. Modeled now (same shape,
  and room to grow), but **no coach-facing UI is built this branch**. The reads
  already surface coach entries on the timeline.

**Many entries may share a date** — a coach might annotate the same day the aluno
submits — so the date is the timeline index, not a unique key. The timeline
orders by `(date desc, created_at desc)`.

## Data model

Migration `0019_gifted_zuras.sql`, two tables:

```
student_checkin
  id, clinic_id, student_id, date (YYYY-MM-DD, server = today),
  author 'student'|'coach', author_user_id,
  weight_kg (nullable at DB; required for a student submission via zod),
  note, created_at, updated_at
  index (clinic_id) · index (student_id, date)

student_checkin_photo
  id, clinic_id, checkin_id (cascade),
  pose 'frente'|'costas'|'lado_esquerdo'|'lado_direito',
  r2_key, sort_order
  unique (checkin_id, pose)   -- one photo per pose per check-in
```

`weight_kg` is nullable so a future coach note-only entry is representable; the
student API always requires it.

## Photos

Progress photos are **private** — the student can view their own, but they are
never public.

- **Client-side compression, no dependency** (`src/lib/image-compression.ts`):
  on pick, the browser downscales the longest edge to ~1600px and re-encodes to
  WebP (JPEG fallback) via `createImageBitmap` (EXIF-orientation aware) + canvas.
  The original the student picks can be any size — **only the small blob is
  uploaded**.
- **Storage** (`src/server/r2.ts` → `putCheckinPhoto`): key shape
  `checkins/<uuid>.<ext>`. Uploads to **R2** when configured; otherwise writes to
  a gitignored **`.uploads/`** dir, so local dev + e2e/CI work without cloud
  creds. `validateCheckinPhoto` is a server backstop (type + ≤ 3 MB).
- **Delivery** (`readCheckinPhoto`): the owner reads their photos back through
  `GET /api/student/checkin/<id>/photo/<photoId>`, which streams the bytes only
  after the DAL join proves the photo belongs to this aluno's own check-in
  (never a public/shared URL). Bytes come from R2 or the local fallback; a
  missing object (e.g. a seeded placeholder key) falls back to a labeled SVG
  placeholder so the modal never shows a broken image. Coach-side viewing is
  still a later feature.

## Architecture

Follows the written-in-stone frontend rules:

- **Page** (`src/app/student/page.tsx`) is a client component; the coach/aluno
  route guard stays in the server layout.
- All traffic goes through **API route handlers + TanStack Query**:
  `GET`/`POST /api/student/checkin`. Every input is validated with **zod**
  (`checkinSubmitSchema` in `src/lib/student-checkins.ts`) and the tenant +
  student come from `getTenantContext()`.
- All DB access goes through the **DAL** (`src/server/dal/student-checkins.ts`):
  `createStudentCheckin`, `listMyCheckins` — doubly scoped (clinic + own
  student). This is the aluno's only **write** path (the portal DAL is read-only).
- The submit form uses **TanStack Form**.

### Upload progress bar

The submit uses **`XMLHttpRequest`**, not `fetch` — `fetch` can't report upload
progress. `xhr.upload.onprogress` drives a **determinate bar (0–100 %)** tied to
the real byte transfer, wired into a TanStack Query mutation. Photos are
compressed on pick (each slot shows a brief "Comprimindo…"), so at submit the
bar reflects the upload only.

## Clinic cadence in the header

The Check-in tab header reflects the clinic's **feedback configuration** (set by
the coach in Configurações): the heading reads `Check-in <frequência>`
(semanal / quinzenal / mensal) and a chip shows `<Frequência> · <dia preferido>`.
The aluno reads it from `getMyProfile`, which now carries `feedbackFrequency` +
`feedbackPreferredDay` off the clinic — so changing it in Configurações
propagates to every student with no code change.

## Evolução

- **Weight chart** — an inline SVG line/area built from the check-in weights
  (`weightSeries`, oldest → newest): gridlines, min/max + first/last-date labels,
  the current weight and the total delta. A single check-in renders a centered
  point with a prompt to log more. Coach annotations without a weight never feed
  it.
- **Histórico de check-ins** — the timeline (both authors). Each row is a button
  that opens a **detail modal** (`GET /api/student/checkin/<id>`) showing the
  weight, note, and the four pose photos; a `coach` marker flags coach entries.

## Seed

`seedAlunoCheckins` gives the demo aluno six weekly check-ins (weights trending
down + notes; placeholder photo keys, since photos aren't served yet) so the
chart + history render. Idempotent.

## Tests

- `tests/student-checkins.integration.test.ts` (PGlite) — persistence (weight +
  note + four photos, author/date/authorUserId), many-per-date, coach annotation
  on the timeline (excluded from the weight series), detail + photo reads scoped
  to the owner, and clinic + own-student isolation.
- `tests/image-compression.test.ts` — the pure downscale math.
- `e2e/student.spec.ts` (student project) — fills the form, attaches the four
  poses, submits (real upload via the local-disk fallback), asserts the success
  state + the live Evolução entry, opens a history entry's modal and asserts the
  four photos render, and captures desktop + mobile screenshots.
