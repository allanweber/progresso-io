# Student anamnese, registration & the online fill flow

An **anamnese template** (`docs/anamneses.md`) is a clinic-owned questionnaire.
This document covers assigning one to a **student**, how a student's answers are
collected, and the redesigned registration flow around it.

## The student's anamnese is a frozen snapshot

When a template is assigned to a student, its `name` + `sections` (the whole
questionnaire) are **snapshotted** onto a `student_anamnesis` row, and answers
are collected there keyed by question key. Editing/deleting the template
afterwards never mutates what a student was asked or answered — the opposite of
the diet/workout **live** model, and the correct choice for a filled form.

- **One current record per student** (`unique(student_id)`), edited in place.
- **"Usar outro template"** re-snapshots the new template and clears the answers
  (status → pending) — behind a confirm dialog on the profile.
- `status` is `pending` → `completed`; `filled_by` records who completed it
  (`aluno` for the online link, `coach` for an in-app fill). Re-editing a
  completed anamnese keeps the original `filled_by` label.

## Registration is one merged action

`/coach/students/new` ("Convidar novo aluno") creates the student, assigns the
chosen anamnese, and then branches on the **access type** (= `modality`):

- **Online** → button "Enviar convite": sends the WhatsApp **anamnese fill link**
  and lands on the profile. The student is only being invited to fill their
  anamnese — no portal account is created yet (there's nothing to log into).
- **Offline / presencial** → button "Registrar aluno": creates the student and
  takes the coach straight to fill the anamnese (`/coach/students/[id]/anamnesis`).

### Portal access is granted on the first prescription

The account-activation (portal login) link is **not** sent at registration. It
goes out the first time the coach **publishes a diet or a workout** for the
student — the moment there's something worth logging in to see
(`sendPortalInviteOnFirstPrescription`, called from the two publish routes). It
fires exactly once: only for online students who haven't activated and haven't
already been sent an invite (any `invitation` row). The coach can also send it on
demand from the profile's header "Enviar convite" button.

### Conditional identity

WhatsApp is the **primary identifier**. An **online** student must have both a
WhatsApp (for the links) and an e-mail (the portal login); an **offline** student
may have either or neither. Both columns are nullable; the rule is enforced in
zod (`studentRegistrationSchema` / `studentFormSchema`) and by two partial unique
indexes — `unique(clinic, phone) WHERE phone NOT NULL` and
`unique(clinic, email) WHERE email NOT NULL`. Phone is stored **normalized**
(digits, `+55` assumed for Brazil; see `@/lib/phone`) so the index is canonical.

## The online fill page (`/anamnesis/fill?token=…`)

A **public** page (no session) gated like invite-accept: the URL carries a random
token (SHA-256 hashed in `student_anamnesis.fill_token_hash`, 30-day TTL). The
aluno confirms their **WhatsApp number** — it must match the one on file — to
unlock the questionnaire. A forwarded link alone can't fill it; confirm attempts
are rate-limited per token. Submitting marks the anamnese completed
(`filled_by = "aluno"`), invalidates the single-use token, and raises the clinic
notification (see `docs/notifications.md`).

## WhatsApp delivery

`@/lib/whatsapp` is a small port (`sendWhatsApp`) mirroring the e-mail helper:
with no provider configured it logs the message and captures its links in the
test outbox (so e2e can drive the flow); a real vendor (Meta Cloud API / Twilio /
Z-API) is wired later behind the same interface. `@/server/onboarding` splits the
two sends by moment:

- `sendAnamnesisInvite` — the anamnese fill link (WhatsApp). Sent at registration
  and by the profile Anamnese card's "Reenviar" action.
- `sendPortalInvite` — the portal access link (also e-mailed). Sent on demand from
  the "Enviar convite" button.
- `sendPortalInviteOnFirstPrescription` — a best-effort, fire-once wrapper around
  `sendPortalInvite`, called from the diet/workout publish routes.

## Profile — "Dados & anamnese"

The first profile tab shows two cards:

- **Perfil** — objective/modality/access, contact, and metrics **extracted from
  the anamnese** via canonical question keys (`idade`, `altura`, `peso_atual`,
  `experiencia`, `frequencia`, seeded into the starter templates). Only answered
  keys are shown; the rest are hidden.
- **Anamnese** — a status badge (Preenchida pelo aluno / pelo coach / Pendente),
  the answers grouped by section (canonical metric keys excluded — they live in
  Perfil), and actions: **Preencher/Editar** (the coach fill page) and **Trocar
  template**.

## Data model (`0015_student_anamnese_notifications`)

- `student_anamnesis` — `clinic_id`, `student_id` (unique), `source_anamnesis_id`
  (nullable provenance), `name`, `sections` (jsonb snapshot), `answers` (jsonb),
  `status`, `filled_by`, `filled_at`, `fill_token_hash` (unique) +
  `fill_token_expires_at`, timestamps.
- `students` — `email` made nullable; the old `unique(clinic, email)` swapped for
  the two partial unique indexes above.

## API

- `POST /api/students` — merged registration (create + assign + online anamnese
  invite).
- `PUT /api/students/[id]` — edit (conditional identity rules).
- `POST /api/students/[id]/invite` — (re)send the WhatsApp **portal access** link.
- `POST /api/students/[id]/anamnesis/invite` — (re)send the WhatsApp **anamnese
  fill** link (while the anamnese is still pending).
- `GET/PUT /api/students/[id]/anamnesis` — read / coach-save the answers.
- `PUT /api/students/[id]/anamnesis/template` — swap the template.
- `GET/POST /api/anamnesis/fill` — public: load the questionnaire / submit with
  the number confirm.
- `POST /api/anamnesis/fill/confirm` — public: verify the WhatsApp number to
  unlock the questionnaire (the number must match before the form is shown).
  Attempts are rate-limited per token, shared with the submit endpoint.

## DAL (`src/server/dal/student-anamneses.ts`)

`assignAnamnesis` (snapshot/upsert), `getStudentAnamnesis`, `saveAnswers`
(coach), `issueFillToken`, `findByFillToken` + `submitFill` (public, raw DB), all
tenant-scoped except the token-based public helpers (the token is the credential).
