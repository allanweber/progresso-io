# AI Program Generator — design record

Growth-roadmap **item 1**. Coach picks goal + anamnese → the AI drafts a full
workout or diet from the platform's own catalog, saved as an **unpublished
draft** the coach reviews and edits before anything reaches the aluno.

**Status: implemented (migration `0031`).** Costs and provider research live in
`docs/ai-provider-costs.md`.

## Where the code is

| Piece | File |
| --- | --- |
| Provider port + dev impl + cost freeze | `src/lib/llm-provider.ts` |
| Client-safe form contract + labels | `src/lib/ai-programs.ts` |
| Catalog block (the cacheable prefix) | `src/server/ai/catalog.ts` |
| PT-BR prompts + repair turn | `src/server/ai/prompts.ts` |
| JSON Schema + zod contracts | `src/server/ai/schemas.ts` |
| Orchestration (quota → model → validate → draft) | `src/server/ai/generate.ts` |
| Shared route body (gates, statuses, copy) | `src/server/ai/route-handler.ts` |
| Quota + audit lifecycle | `src/server/dal/ai.ts` |
| Routes | `POST /api/students/[id]/{workout,diet}/generate` |
| UI | `src/components/ai/ai-generate-button.tsx` |
| Admin overview (cross-tenant) | `ai.getAdminAiOverview`, `GET /api/admin/ai`, `src/app/admin/ai/page.tsx` |
| LLM price list | `src/lib/provider-prices.ts`, `src/server/dal/provider-prices.ts`, `/api/admin/ai/prices` |
| Tests | `tests/ai-generator{,.integration}.test.ts`, `e2e/ai-generator.spec.ts`, `e2e/admin-ai.spec.ts` |

Two traps worth knowing about, both found by tests during the build:

- **`plan_limit.ai_generations` must be spelled out wherever the table is
  seeded** — `src/db/seed.ts` and two integration fixtures all wipe and re-insert
  it. A row that *exists* with a NULL there reads as **unlimited**, so omitting
  the column silently hands every Free clinic uncapped model calls.
- **The button has to be on the "already has a program" screen too.** Both the
  Treino and Dieta tabs render four different states, and the first pass wired
  the generator into only two of them (no program yet, unpublished draft). The
  state it missed — an aluno with a *published* program — is the steady state
  for every established aluno, and "regenerate for the next cycle" is the whole
  point. `e2e/ai-generator.spec.ts` caught it.

---

## Scope

**This phase ships workout + diet generation** plus the whole substrate (provider
port, credits, audit trail, prompt assembly). The roadmap's other two AI surfaces
— **AI-drafted check-in feedback** and **"reescrever em tom X"** — are a
follow-up: they are free-text, not catalog-grounded JSON, and would distort the
abstraction while it is still forming.

## The credit model

| Plan | Generations / calendar month |
| --- | --- |
| Free | 1 |
| Solo | 10 |
| Clínica | 25 |
| Enterprise | unlimited (`NULL`) |

- **One artifact = one credit.** A workout and a diet for the same aluno are two
  generations, because they are two model calls. Free's single credit buys a
  workout *or* a diet — enough to prove quality and immediately insufficient,
  which is the job of a free tier on the flagship feature.
- **A trial grants Solo's 10.** It falls out of `getPlanLimits` for free, and a
  trial that withholds the flagship feature is a trial of the wrong product.
- **The quota is a `count(*)`, never a stored counter** — the same reasoning as
  `clinic.trial_ends_at`: a counter needs a cron to reset and drifts when a write
  fails halfway; a row count cannot drift. Window is the **calendar month in
  `America/Sao_Paulo`**, because "10 por mês" has to turn over when the coach's
  month does, not when UTC's does.
- **A failed generation is free.** Rows are written `pending` *before* the model
  call and settled `succeeded`/`failed` after. `pending` + `succeeded` consume a
  credit, so two concurrent requests can't both slip under the cap; `failed`
  releases it. The window between is the only overcount and it self-heals.
- **The caps are a product decision, not a cost control.** Worst case (the most
  expensive candidate model, Clínica burning all 25) is ~0.9% of a R$379
  subscription — one to two orders of magnitude below the WhatsApp line in
  `docs/monetization.md` §4(a). Do not argue these numbers from a spreadsheet.

Plumbing follows the existing capability pattern: `plan_limit.ai_generations`
(`NULL` = unlimited) + `clinic.ai_generations_override` + a `getAiGenerationLimit`
helper alongside the six in `src/server/dal/plans.ts`.

> One deliberate inversion: for every other capability a missing `plan_limit` row
> falls back to *permissive*. AI credits fall back to the plan's **coded default**
> instead, because every generation is a paid model call. Since the column is
> nullable (Enterprise = unlimited), a `NULL` cannot distinguish "unlimited" from
> "row missing" — the query has to select the joined primary key as a presence
> marker rather than `??`-ing through the null.

## The catalog: whole, base-only, cached

**No per-aluno subsetting.** The prompt carries the **entire platform base
catalog** (`clinicId IS NULL`) — 873 exercises or 597 foods — identical bytes for
every clinic, every aluno, every generation.

Why this beats a filtered subset:

- **The cache actually works.** One global prefix ⇒ effectively 100% hit rate
  after the first call. Per-aluno subsets would have hit ~0%, because the prefix
  would differ every time.
- **No tenant leakage surface.** A clinic's custom exercise can never appear in
  another clinic's prompt. With per-clinic catalogs that was a bug waiting to
  happen; base-only makes it structurally impossible.
- **Deterministic and testable.** The prompt is a pure function of (base catalog,
  anamnese, form) — a fixture catalog gives byte-reproducible prompts, so prompt
  regressions are catchable in a unit test.
- **Validation can never false-fail.** Base rows are visible to every clinic, so
  the existing `invalid_exercise` / `invalid_food` guard only ever fires on a real
  hallucination.

**Accepted trade-off:** choosing from 873 is harder than choosing from ~100, so
drafts are rougher. That is fine because the output is explicitly a draft in the
existing editor, and **clinic-specific customization is the coach's manual job
after generation.** If drafts prove consistently wrong-flavored, the lever is a
better prompt — not a return to subsetting.

**Split per kind:** exercises only for workout generation, foods only for diet.
Two stable prefixes instead of one bigger one — half the tokens per call and a
shorter prompt the model attends to better.

### Stability rules (all three matter)

The prefix breaks if the **order**, the **set**, or the **serialization**
changes. All three are silent failures — no error, just a cold cache.

1. **`ORDER BY code NULLS LAST, id`.** `code` is `UNIQUE` and populated for base
   rows, and comes from source data, so it is stable *across environments* where
   a random `id` would not be. The `id` tiebreaker covers base rows an admin
   created without a code. **No migration is needed** — a dedicated sort column
   would only earn its place for *curation*, and a column whose purpose is to be
   tuned is a column that costs cache hits every time it is tuned.
2. **Frozen serializer** — fixed field order, never `JSON.stringify` over an
   object whose key order could vary.
3. **Integer indices, not UUIDs.** `12: Supino reto com barra (peito, barra)`.
   Cuts the block to roughly a third of its token size, and an out-of-range
   integer is caught instantly where a well-formed-but-wrong UUID needs a lookup.
   Indices map back to UUIDs server-side.

### Global filters (fixed list, identical for everyone — cache unaffected)

- `archived = false`, both tables.
- **Foods with any null macro excluded** (`energyKcal` / `protein` /
  `carbohydrate` / `fat`). TACO has genuinely unmeasured cells; a diet item with
  unknown kcal is a correctness problem, not a preference.
- **`needsReview = true` foods excluded** (~24 duplicate descriptions). Asking a
  model to choose between two identically-named rows invites the wrong choice.

## Generation flow

1. **Gate: the aluno needs a `filled` anamnese.** The button is *disabled with an
   explanation*, never hidden. Generating a diet without weight or age produces
   confident nonsense, and this is health-adjacent output going to a real person.
   The useful side effect: the AI button becomes the strongest reason a coach has
   ever had to actually send anamneses out.
2. **Gate: credits remaining this month.**
3. **The dialog asks a different form per kind.** Treino: objective, equipment
   available, days per week. Dieta: objective, dietary restrictions, meals per
   day. Every field is **required** but **prefilled where the app already knows**
   (`objective` from the aluno's goal, the counts from their defaults), so
   "required" means confirmed rather than retyped. Equipment and restrictions are
   *not* in the anamnese at all, which is exactly why they are asked here.

   One shared form was the original shape and it was wrong in both directions:
   it refused to generate a *dieta* until the coach ticked gym equipment, and it
   fed dietary restrictions into a *treino* prompt whose rules never mention
   them. `aiWorkoutGenerateSchema` and `aiDietGenerateSchema` are separate so
   neither dialog, route, nor prompt can accept the other's answers.
4. **If an unpublished draft exists, confirm before overwriting.** Silently
   destroying a coach's manual edits is the one unforgivable outcome; refusing
   outright would obstruct "regenerate, I didn't like it", the most likely second
   action. The dialog must also say that regenerating spends another credit.
5. **Write the `pending` audit row** (claims the credit).
6. **Call the model**, synchronously. The coach is watching a progress state.
   The audit row makes promotion to a polled job additive, not a rewrite, if a
   platform request timeout ever forces it.
7. **Validate every returned index against the catalog.** On any invalid id:
   **one repair retry, free** — the retry does not cost a second credit. Fuzzy
   name-matching is not an option: "arroz integral cozido" vs "cru" differ by ~3×
   in kcal, and a fuzzy match that picks wrong is worse than an error.
8. **`saveDraft`** through the existing `student-workouts` / `student-diets` DAL.
   Never `publishDraft` — nothing reaches the aluno unreviewed.
9. **Settle the audit row** `succeeded` (or `failed`, releasing the credit).

Equipment and restrictions are **prompt text, not `WHERE` clauses** — the model
can reason about a constraint it is told, where a filter can only delete rows.

**Treino and dieta are two generations, one credit each.** They are separate
model calls against separate catalogs with separate audit rows, so a coach who
wants both spends two credits — the dialog says so before the first is spent.

## Generated structure — deliberately narrow

Workout output carries **exercise, sets, reps, rest, per-exercise note** only.

Explicitly excluded for now: **techniques** (drop-set, bi-set…), **supersets**
(`groupId`), and **AI-chosen substitutes**. Supersets need two exercises to agree
on a `groupId` — a constraint models violate, and one a coach adds in two clicks.
Catalog substitutions already hydrate live, so AI-invented ones would mostly
duplicate existing data. Widen once real output quality is known.

## The provider port

`src/lib/llm-provider.ts`, mirroring `src/lib/whatsapp-provider.ts`: a typed port,
a `dev` implementation that never generates, and a runtime switch. Fourth
instance of a pattern this codebase already commits to (Resend, Sentry, R2,
WhatsApp).

- **One capability**: ask for JSON matching a schema, get it or a typed reason
  why not. No streaming, no tool-calling, no conversation state.
- **OpenAI-compatible `/v1/chat/completions`** is the seam — nearly every cheap
  provider exposes one, so swapping is base-URL + key + model-string, with no
  dependency surface and nothing between us and a provider's error messages.
- **No default model string.** `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` are
  all required or the port falls back to `dev`. Model identifiers churn fast
  enough that a hardcoded one is a latent 404, and a wrong default fails at
  generation time — after a credit is at stake — rather than at boot.
- **Unconfigured degrades to "feature off"**, never to a 500: the route answers a
  friendly *"IA não configurada"* and spends no credit.
- **Tested against the `dev` provider**, plus an injectable fake for happy-path
  integration tests. No HTTP-mocking dependency — the suite has none today.
- **Prompt order: catalog first, anamnese and form last**, so the volatile part
  never sits inside the cacheable span.

**First provider: Qwen3.7 Flash.** See `docs/ai-provider-costs.md`, including the
open LGPD risk on Alibaba Cloud.

## The audit row (`ai_generation`)

Both the quota meter and the cost ledger. Per row: `clinicId` (tenant key),
`studentId`, `coachId`, `kind`, `status`, `provider`, `model`, token counts
(including **cached** input separately), `durationMs`, `repaired`, `errorCode`,
**`catalogHash`** and **`anamnesisSnapshotId`**.

- **Cost is deliberately NOT stored on the row.** Tokens are the half that can
  only be measured as the call happens; the price is the half that can be looked
  up. Prices live in `provider_price`, effective-dated, and each generation is
  matched to whichever was in force the day it ran. So a vendor price change adds
  a row and history stays correct, and a **mistyped** price is an edit that
  *fixes* history — neither of which a number frozen on the audit row could do.
  (An earlier version did freeze one, from `LLM_PRICE_*` env vars nobody set, so
  it could only ever say `NULL`; dropped in migration 0032, replaced by the table
  in 0033.)
- **The prompt itself is never stored.** The anamnese snapshot id and the catalog
  hash make it fully reconstructible without duplicating aluno health data into a
  second table, in plain text, in every backup. Same data-minimization logic as
  `errorCode` never holding a provider body.
- **`catalogHash` + cached-token counts are the cache observability.** They turn
  "why did caching stop hitting last Tuesday" from an investigation into a query:
  the hash changed, and you can see whether it was a seed, an admin edit, or a
  code change.
- It is also the only thing that can ever check `docs/monetization.md` §7 against
  reality rather than assumption — which is what `/admin/ai` reads.

## The price list (`provider_price`)

Platform reference data, like `plan_limit` — no `clinicId`, managed by admins on
the **Preços** tab of `/admin/ai`. Prices are per **million** tokens in micro-USD
(`$0.03/M` → `30000`): integers, because a month of summing floats drifts, and
money that drifts is money nobody trusts.

The rule is one function, `priceAt`: **the row with the greatest `effectiveFrom`
at or before the moment the generation ran.** Everything else falls out of it.

| Situation | What happens |
| --- | --- |
| Vendor raises its price | Add a row. March's generations keep March's rate. |
| You mistyped a price | Edit the row. History is *corrected*, not left wrong. |
| Price announced for next month | Enter it now; it's inert until its date. |
| Model never priced | Its generations read as unpriced — an honest "unknown", and a gap the admin can close on the spot. |
| Vendor states no cache rate | Leave it blank; cache reads bill as normal input, over- rather than under-stating. |

A blank cached rate is `NULL`, **not** `0` — zero is the real claim "cache reads
are free", and the two must not collapse into each other. The form and its tests
enforce that distinction on both sides.

## `/admin/ai` — the read that closes the loop

The audit row shipped write-only, which made the two claims the feature rests on
uncheckable. This screen is the read side.

| KPI | The claim it tests |
| --- | --- |
| **Taxa de cache** | The base-only catalog keeps the prompt prefix byte-identical, so it stays in the provider's cache. A ratio that sits low means the prefix is moving between calls — nothing else would say so. |
| **Gerações vs. limite** (per clinic) | 1/10/25 is the right shape. Clinics pinned at the cap say it's stingy; a platform of 2-a-month coaches says it's generous. |
| **Custo no mês** | `docs/monetization.md` §7's ~0.9%-of-revenue projection, built on unverified prices and a guessed token count. |
| **Reparos / falhas** | The prompt still produces schema-valid JSON. A rising repair count is drift, and each repair is a second paid round-trip. |

Three details that are not incidental:

- **A partial cost total is labelled `parcial`, never silently summed.** A model
  with no price entered leaves its generations uncosted; adding them as zero
  would under-report the bill by exactly the amount you can't see.
  `unpricedGenerations` counts them, and unlike the old env-var version this is
  a gap the admin can close on the spot — the Preços tab is on the same screen.
  A generation that burned no tokens at all is neither priced nor counted as
  missing: there is nothing to price, so it would only dilute the signal.
- **`configured` rides along on the response.** An all-zero table means either
  "nobody generated anything" or "the feature was never switched on", and the
  admin needs to know which.
- **The allowance shown is resolved by the same code the coach's own counter
  uses** (`resolveAiGenerations` in `src/lib/plans.ts`, shared with
  `getPlanLimits`). An admin screen that disagreed with the coach's credit line
  would be worse than no screen — including the trial case, where a `free` clinic
  gets Solo's 10 and the row says so.

## Smaller decisions

- Prompts are written in **PT-BR** — the domain vocabulary is Portuguese.
- A **second concurrent generation for the same aluno is rejected**, not raced —
  two in flight would collide on `saveDraft`.
- Route/DAL rules are unchanged: zod on every input, tenant from
  `requireClinic()`, all DB access through the DAL, page is a client component
  talking to `/api/*`.

## Open, not blocking the build

- **LGPD posture on Alibaba Cloud** — privacy policy update + DPA check before
  launch (`docs/ai-provider-costs.md`).
- **Verified pricing** — the whole table except the Anthropic row is unverified;
  promotion into `docs/monetization.md` §7 (both language halves, plus a §4(a)
  line and a §6.3 margin re-check) waits on live sources.
- **Measured token counts** — every token figure quoted anywhere is arithmetic on
  assumed row sizes. First measurement task during implementation.
