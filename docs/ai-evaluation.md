# Avaliação com IA (check-in) + Notas do aluno

The model's read of **one check-in** — body composition plus advice — held as a
draft until the coach accepts or discards it, and the coach-only **Notas** tab
that accepted evaluations land on.

It runs from the **Feedback** tab (`/coach/students/[id]/feedback`): the check-in
review dialog carries a compact trigger, and the evaluation itself opens in **its
own modal** stacked over it. That separation is deliberate — the review dialog
holds the feedback the *aluno* receives, and the evaluation holds a note only the
coach ever sees; inline, the two textareas competed for the same attention.
(Nested dialogs are an established pattern here: the photo lightbox stacks over
the same review dialog.)

Clinic-scoped like everything else; one AI credit, on the same monthly cap as
treino/dieta (`docs/ai-generator.md`).

## The loop

1. The coach opens a check-in and presses **"Avaliar com IA"**, which opens the
   modal on a short form: an optional **"Instruções extras"** textarea (a
   one-off steer for this run — "focar na evolução da cintura", "aluno relatou
   dor no ombro"), the clinic's remaining generations this month, and the button
   that actually spends one. With a draft already pending the trigger reads
   **"Ver avaliação"** and opens straight to it; **"Gerar de novo"** is what
   brings the form back, naming the pending draft as what gets replaced.
2. The server assembles the aluno's goal + anamnese, this check-in (weight,
   measures, note, photos), the previous check-in's note, a six-point numeric
   series, the **coach's own notes**, and the coach's instructions for this run
   — and asks a **multimodal** model for a body-fat read, a verdict and advice
   **written to the coach**.
3. The answer is stored as a **pending draft** (`checkin_evaluation`, one per
   check-in). The coach can edit the percentage and the note text.
4. **Accept** → the percentage goes onto the check-in's `checkin_assessment`,
   the draft is marked `accepted`, and a **note** is written on the Notas tab.
   **Descartar** → the draft is marked `discarded` and kept.

The aluno never sees any of it. Nothing under `/api/student/*` reads
`checkin_evaluation` or `student_note`, and the student-facing feedback textarea
is deliberately **not** pre-filled with the model's words.

## The body-fat ladder

This is the design's centre of gravity: **what the server can compute, it
computes, and the model's version of that number is discarded.** Same rule as
`src/server/ai/rebalance.ts`.

| Condition | Result | `body_fat_source` |
|---|---|---|
| All **7** skinfolds + `students.sex` + `students.birth_date` | Jackson-Pollock 7-site → Siri, computed by the server | `skinfolds` |
| Otherwise, photos present | The model's **visual estimate** + a `confidence` | `estimate` |
| Neither | `null` — the evaluation still runs and still gives advice | `null` |
| The coach types a percentage into the measures form | as typed | `manual` |

It is **all-or-nothing on seven folds**: the polynomial is fitted to the sum of
all seven sites, so a partial set produces a wrong number rather than a rougher
one. There is no 3-site fallback by design.

`massa magra % = 100 − % de gordura` — the complement, derived and never stored.
It is **massa magra**, not muscle mass: lean mass includes bone, water and
organs, and nothing here estimates skeletal muscle. In the UI the two fields are
**bidirectionally coupled**, so an inconsistent pair cannot be saved.

The math is pure and unit-tested in `src/lib/body-composition.ts`.

### What the coach has written

The five most recent **manual** notes go into the prompt, oldest → newest, each
truncated at 500 characters. They are the context nothing else carries: "relatou
dormir mal", "desconfio que não está seguindo a dieta no fim de semana", "voltou
de viagem" — the reasons the numbers look the way they do.

**Notes created by accepting a previous AI evaluation are excluded**, by design.
Those are largely the model's own prior wording, and feeding them back makes it
restate its last conclusion instead of reading this check-in; the history it
actually needs is already in the numeric series. They are also framed in the
prompt as *the coach's observations, not instructions*, so a note that happens to
read like a command is treated as something the coach believes.

Notes reach the provider like the anamnese does. They are coach-only in the
product, never in the sense of never leaving the process.

### Instructions, vs. notes

The modal's **"Instruções extras"** textarea is a different thing from a
`student_note`: it is a one-off ask about *this* run ("focar na cintura"), typed
right before pressing the button and never persisted anywhere once the call
returns — not stored on the draft, not written to the aluno's record. Notes are
a fact worth keeping about the aluno; instructions are a fact about the
question, and the two are validated and rendered in the prompt separately
(`evaluationRequestSchema`, `evaluationUserPrompt`). Unlike notes, which are
framed as *context, not instructions*, this text is put to the model as an
actual instruction — the coach typed it for exactly this call — though the
system prompt's own rules (no invented number, no numeric prescriptions) still
win if the two conflict.

### Sparse data is never a refusal

An online aluno with a weight and one photo is the **normal** case. The only
refusal is `no_checkin_data`: a check-in with no weight, no measure, no photo
and no note, where charging a credit for a prompt about nothing is indefensible.

## The model call

One call, one credit, `ai_generation.kind = 'evaluation'`. Three things make it
unlike the program generators:

- **It carries images.** `LlmJsonRequest.images` holds `data:` URIs; the photos
  are private R2 objects, so a URL would either 404 for the provider or have to
  be made public. `src/server/ai/photos.ts` reads them, downscales to 768 px
  with `sharp` and encodes JPEG — vision models tile at a fixed resolution
  anyway, and body composition is a whole-silhouette judgement.
- **There is no cacheable prefix.** No catalog, and a photo is unique to one
  person on one day, so `catalog_hash` is `NULL` and the system prompt is kept
  short instead of padded.
- **It needs a multimodal model**, configured separately at `/admin/ai`
  (`ai_settings.vision_model` + `vision_fallback_models`). Today the default is
  the *same* slug as the text model — `qwen/qwen3.7-flash` accepts images and is
  the cheapest thing that does — but it stays a separate setting because the next
  cheap model that wins the text comparison may be text-only. `NULL` falls back
  to the text slug, so a row saved before this feature existed self-heals.

  **Verify a slug before trusting it** (`curl https://openrouter.ai/api/v1/models`,
  and check `architecture.input_modalities` contains `image`). A slug that does
  not exist fails as `Provedor respondeu 400.` with the real reason only in the
  server log — this default was wrong once for exactly that reason. `:floor` is a
  routing suffix, not a model id: the response comes back naming the base slug.

### What the model may answer

`src/server/ai/schemas.ts` → `evaluationSchema`:

```
bodyFatPct   number | null     -- null when the photos cannot support an estimate
confidence   baixa|media|alta | null
unavailable  string | null     -- the reason, when bodyFatPct is null
verdict      manter | ajustar | reavaliar
summary      string            -- one line
evolution    string            -- "" on a first check-in; no invented trend
diet         string            -- advice to the COACH
workout      string
```

Two deliberate constraints:

- **It may decline to give a number.** Photos arrive clothed, dark and cropped;
  a confident 18% read off a winter coat is the worst thing this feature could
  produce, because the coach may write it into a client's record.
- **The advice is prose, never numeric directives.** No kcal deltas, no g/kg.
  Arithmetic is what a model gets wrong, and structuring prescriptions would
  imply a one-click apply that would push AI-authored macros into a real diet.

When the server computed the percentage, `normalizePayload` clears the model's
own guess so the stored answer never carries two competing figures.

## Data model

Migration `0041_outgoing_magik.sql`.

```
checkin_evaluation                      -- one per check-in (unique)
  id, clinic_id, checkin_id, student_id, ai_generation_id
  status          pending|accepted|discarded
  payload         jsonb    -- the model's answer, verbatim and immutable
  body_fat_pct, body_fat_source, confidence
  decided_by_user_id, decided_at

student_note                            -- the coach's record, coach-only
  id, clinic_id, student_id, checkin_id (nullable, ON DELETE SET NULL)
  source          manual|ai_evaluation
  body            text     -- the coach's words (editable)
  payload         jsonb    -- the accepted evaluation, kept even when body is rewritten
  acceptance      accepted|accepted_edited
  body_fat_pct             -- as ACCEPTED, which may differ from payload
  author_user_id
```

Plus: `students.sex` + `students.birth_date` (both nullable — the equation's
inputs), `checkin_assessment.body_fat_source` + `.protocol`,
`clinic.assessment_preset`, `ai_settings.vision_model` +
`.vision_fallback_models`.

Regenerating **overwrites** the draft and resets it to `pending`. A discarded
draft is kept rather than deleted: the credit was spent, and "the coach threw
this one away" is the clearest quality signal the feature has.

`student_note.checkin_id` is `SET NULL`, not cascade — deleting a check-in must
not silently delete the coach's conclusions about it.

## The avaliação física preset

The measures form was 22 numeric inputs, and coaches skipped it. It now opens on
a **preset** (`clinic.assessment_preset`, overridable per assessment and stored
on the row):

| Preset | Renders |
|---|---|
| `completa` | 14 circumferences + 7 folds |
| `basica` | cintura, quadril, braço, coxa — no folds |
| `so_peso` | nothing; weight and photos carry it |
| `personalizada` | every site (and what pre-preset rows read as) |

**The preset is a form filter, not a formula selector.** Only `completa` can
produce a caliper-derived body fat, and the form says so out loud when the
chosen preset cannot — so a coach chooses a visual estimate knowingly rather
than discovering it after spending a credit.

## API

All coach-only (`withCoach`), all zod-validated, all through the DAL:

```
POST   /api/students/[id]/checkin/[checkinId]/evaluation          run it {instructions}
GET    /api/students/[id]/checkin/[checkinId]/evaluation          read the draft
POST   /api/students/[id]/checkin/[checkinId]/evaluation/accept   {bodyFatPct, body}
DELETE /api/students/[id]/checkin/[checkinId]/evaluation          discard
GET/POST     /api/students/[id]/notes
PATCH/DELETE /api/students/[id]/notes/[noteId]
```

`instructions` is optional and nullable (`evaluationRequestSchema`) — blank or
absent both mean "no steer for this run".

Refusal → status: `not_configured` 503 · `no_anamnesis` 409 · `quota_exceeded`
402 · `already_running` 409 · `no_checkin_data` 409. A provider failure is 502
and costs **no credit** (the audit row settles `failed`).

`quota_exceeded` is checked **server-side, before the credit is claimed and
before the model is called** — the same gate the client uses to disable the
button is re-checked here, because a client that only disables a button is not
a client that enforces a limit.

Accept sends **only** the fat percentage — sending both halves would create a
way to store 22% fat next to 82% lean.

## Testing

`src/lib/llm-provider.ts` ships a third provider next to `dev` and `openrouter`:
**`stub`**, selected by `LLM_PROVIDER=stub` and pinned on for the e2e server in
`scripts/e2e.mjs`. It returns fixed, schema-valid answers for `avaliacao`,
`treino` and `dieta` and never leaves the process.

It exists because the `dev` provider refuses, which left every path *after* a
successful generation unreachable from the suite — and the accept flow is the
whole of this feature. **Never set it in production.**

- `tests/body-composition.test.ts` — the equations, and every refusal path.
- `tests/ai-evaluation.test.ts` — the ladder, payload normalization, contracts.
- `tests/checkin-evaluations.integration.test.ts` — tenancy, draft lifecycle,
  the assessment write, and that notes never leak.
- `e2e/evaluation.spec.ts` — generate → couple → edit → accept → note → chart,
  at desktop and mobile, and the aluno's session failing to reach the route.
