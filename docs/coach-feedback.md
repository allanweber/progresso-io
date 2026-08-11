# Coach check-in & feedback

The coach side of the check-in loop, on a student's ficha at
`/coach/students/[id]` — the **Feedback** tab (review + respond + manual
check-in) and the **Evolução** tab (weight chart + comparable photos + a Medidas
Δ table). Builds directly on the aluno check-in model (`student_checkin` +
`student_checkin_photo`, see `docs/student-checkins.md`). The clinic is the
tenant, so every row carries `clinic_id`; the coach may act on any student **in
their clinic**, never another's.

## The loop

1. The aluno submits a check-in from the portal → a **`checkin_submitted`
   notification** fires for the clinic (every coach's bell; href → the student's
   Feedback tab).
2. The check-in shows on the Feedback timeline as **pending** ("aguarda
   resposta"). The coach opens it, sees the weight, note and **photos**, and
   writes a **feedback** response — optionally capturing a body **assessment**
   (measures + skinfolds).
3. Submitting the feedback stamps the check-in and clears the pending state; the
   response is **sent to the student's WhatsApp** (logged in dev) and shows in
   the aluno's own Evolução timeline + detail modal.
4. The coach can also log a **manual (in-person) check-in** with no prior
   submission — weight, note, optional photos and an optional assessment.

## Data model

No new check-in table — feedback lives on the existing `student_checkin` row
(migration `0020_odd_hellcat.sql`):

```
student_checkin  (+ columns)
  feedback              text        -- the coach's response
  feedback_at           timestamp   -- set when reviewed
  feedback_by_user_id   → user
```

**Pending is derived, not stored:** a check-in is pending ⇔
`author = 'student' AND feedback_at IS NULL` (`isCheckinPending` in
`src/lib/student-checkins.ts`). One source of truth — no status column to drift.

The optional body assessment is its own table (one per check-in):

```
checkin_assessment
  id, clinic_id, checkin_id (unique), student_id,
  assessed_at date,
  circumferences jsonb  {cintura, quadril, ...}   -- cm, only measured sites
  skinfolds      jsonb  {tricipital, ...}          -- mm, only measured sites
  body_fat_pct, recorded_by
```

Weight is **not** here — it stays on `student_checkin.weightKg` (the aluno's
self-report, or the coach's number on a manual entry), so the weight chart is
"one point per check-in". The site catalog (labels + zod) is
`src/lib/checkin-assessment.ts` — the full standard avaliação: 14 circumferences
+ the 7-site Jackson-Pollock skinfolds + body-fat %.

The design's three tags are **derived**, no `type` column: `online` = student
entry, `presencial` = coach entry with measures/photos/weight, `coach` = a
note-only coach annotation.

## Architecture

Follows the written-in-stone frontend rules:

- **Pages** (`/coach/students/[id]/feedback` + `/evolution`) are client
  components; the coach route guard stays in the server layout.
- All traffic goes through **API route handlers + TanStack Query**, each
  validating input with **zod** and deriving the tenant via `requireClinic()`:
  - `GET/POST /api/students/[id]/checkin` — timeline / manual check-in (multipart
    + optional photos, reusing the aluno compression + XHR-progress pipeline).
  - `GET /api/students/[id]/checkin/[cid]` — detail (photos + assessment).
  - `POST /api/students/[id]/checkin/[cid]/feedback` — feedback + optional
    assessment; also logs the WhatsApp.
  - `GET /api/students/[id]/checkin/[cid]/photo/[pid]` — **clinic-scoped** photo
    stream (the DAL join proves the photo belongs to a check-in of this student
    in this clinic; never a public URL).
  - `GET /api/students/[id]/evolution` — weight series + assessments + photo sets.
- All DB access goes through the **DAL** (`src/server/dal/coach-checkins.ts`),
  every function gated by `studentInClinic(ctx, studentId)` before it trusts the
  id. The assessment write is an **upsert** on the unique `checkin_id`, so
  re-responding replaces the measures rather than duplicating them.

## Shared UI

To avoid duplicating the aluno pieces, the reusable bits live under
`src/components/checkins/`:

- `photo-upload.tsx` — the pose upload slots, the `usePhotoSlots` hook, the
  XHR-progress uploader (`uploadCheckinForm`) and a read-only `CheckinPhotoGrid`.
  Shared by the aluno submit form and the coach manual check-in.
- `weight-chart.tsx` — the inline SVG weight chart (aluno + coach Evolução).
- `assessment-fields.tsx` — the controlled measures form (coach review + manual).
- `assessment-view.tsx` — the read-only measures display (coach + aluno modal).

## Evolução

- **Weight chart** — the same chart as the portal, over every check-in weight.
- **Fotos comparáveis** — earliest vs latest check-in that carry photos, with a
  pose selector.
- **Medidas** — a Δ table built from the assessments: first vs last value per
  measured site, colored by direction (down = green for a cutting phase).

## WhatsApp

`sendCheckinFeedbackWhatsApp` (`src/lib/whatsapp.ts`) delivers the feedback to
the student. WhatsApp has no provider wired yet, so in dev/tests it **logs** and
captures the portal link in the test outbox — the caller contract is stable for
when a provider is added. Fires on the initial feedback and on a manual
check-in's note; never throws in the unconfigured path.

## Seed

`seedAlunoCheckins` gives the demo student a full loop: weekly check-ins (most
answered, the newest left **pending** so the coach queue has one to respond to),
a coach annotation, and a coach presencial entry — plus two assessments, so the
Medidas Δ table has a before/after.

## Tests

- `tests/coach-checkins.integration.test.ts` (PGlite) — the clinic boundary (no
  cross-clinic read/write), the feedback → pending-cleared lifecycle surfaced to
  the aluno, the assessment upsert, the manual check-in, the evolution
  aggregation, and the `checkin_submitted` notification on submit.
- `e2e/feedback.spec.ts` (coach project) — reviews a pending check-in (sees the
  photos, writes feedback + measures, submits), logs a manual check-in with a
  photo, and asserts the Evolução chart + Medidas Δ table + comparable photos;
  desktop + mobile screenshots.
