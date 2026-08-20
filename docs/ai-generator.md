# AI Program Generator — design record

Growth-roadmap **item 1**. Coach picks goal + anamnese → the AI drafts a full
workout or diet from the platform's own catalog, saved as an **unpublished
draft** the coach reviews and edits before anything reaches the aluno.

**Status: implemented (migrations `0031`–`0034`).** Costs and provider research
live in `docs/ai-provider-costs.md`.

## Where the code is

| Piece | File |
| --- | --- |
| Provider port (OpenRouter) + dev impl | `src/lib/llm-provider.ts` |
| Model settings: defaults, zod contract | `src/lib/ai-settings.ts`, `src/server/dal/ai-settings.ts`, `PUT /api/admin/ai/settings` |
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
| Tests | `tests/ai-generator{,.integration}.test.ts`, `tests/llm-provider.test.ts`, `e2e/ai-generator.spec.ts`, `e2e/admin-ai.spec.ts` |

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

## The anamnese

**Both generators send the whole anamnese, and neither runs without one.** The
gate refuses with `no_anamnesis` before a credit is claimed — generating a diet
without weight or age produces confident nonsense, and this is health-adjacent
output going to a real person.

`renderAnamnesis` walks the snapshot's sections in order and emits every
answered question as `- <label>: <value>`, grouped under its section title.
Nothing is filtered, truncated or summarised: a coach who added a question about
shift work gets that question in the prompt, and it costs the same whether the
model uses it or not. Unanswered questions are skipped rather than sent blank,
because an empty label invites the model to fill it in.

It rides in the **user** half of the prompt, next to the coach's form and the
current diet — per-aluno content must never enter the cacheable system prefix.

The anamnese also feeds one piece of *arithmetic* rather than judgement: the
canonical `peso_atual` answer becomes the aluno's body weight, and "alta
proteína" is then prescribed as 2,2 g per kg (`PROTEIN_G_PER_KG`) instead of a
share of the day's calories. That is what the prompt says and what a coach
means. An anamnese with no usable weight falls back to the share — never to a
guessed weight, since a wrong one silently moves the target.

## The server checks the answer

The prompt states the targets and the aversions, and the model still misses
them. A real generation asked for 2600 kcal and came back at 2827; another was
told to avoid feijão and served feijão at lunch. Both are things the server can
check **exactly** — it has every food's macros and the coach's own words — so
`src/server/ai/verify.ts` checks them instead of asking more firmly:

- **Targets.** The day is summed from the catalog (`kcal/100 g × grams ÷ 100`)
  and compared against each given target. More than **5%** off is a finding.
- **Evitar.** The free text is split into searchable words (≥4 characters,
  accent-folded, minus a small stopword list) and matched against the
  description of every food used. Word-level because the phrase as the coach
  wrote it — "não come peixe" — appears in no food description.

### The numbers are fitted, not requested

Checking and re-asking was **not enough**, and the second round of real
generations proved it: 2600 asked → 2827, then 3214; 2500 low-carb asked → 1832
with 61% of the calories from carbohydrate. Restating the target moves the
number without controlling it, because summing twenty foods and solving for
portions is arithmetic.

So `src/server/ai/rebalance.ts` does it. After the model has had its say —
including its free repair turn — the server fits the **quantities** to the
coach's numbers and stores the fitted plan. What the coach opens adds up.

- **Only quantities move.** Which foods, in which meal, in what order is the
  model's work and is left alone; composing a plan is the part it is good at.
- **Per class, not one global factor.** Foods are classed by the macro carrying
  their calories (protein / carb / fat, plus "free" for anything under
  40 kcal/100 g — scaling broccoli to close a 200 kcal gap gives 900 g of
  broccoli). Iterative proportional fitting moves each class until the macros
  land. A single factor fixes the calories and leaves a low-carb request at the
  carbohydrate share it arrived with, which is the exact failure above.
- **Targets come from everything the coach said.** Gram targets win outright; a
  macro profile fills in the rest — against the kcal target when there is one,
  against the plan's own calories when there isn't, since "baixo carbo" alone is
  a complete instruction about the *split*. Nothing measurable asked → no fit.
  The profile shares live next to the fit and are the same numbers the prompt
  states, so instruction and arithmetic cannot drift apart.
- **Bounded at 0.5×–2× of what the model prescribed**, measured against the
  original portion through every pass. A fit with no bounds answers "0.2× the
  chicken, 3× the rice"; a target it cannot reach inside them is approached, not
  forced.
- **Household portions stay whole** — a count is rounded to whole slices and the
  grams recomputed from it, because three and a half slices of bread is not a
  prescription anybody follows.
- **It says so.** A fitted plan carries a line in its observações with the final
  numbers, so a coach comparing them to what the model wrote is not left
  guessing which is authoritative.

Findings go back through the **repair turn that already exists** for
hallucinated catalog indices: one extra round-trip, costing tokens and not a
credit, naming the real figures ("a dieta soma 2827 kcal e a meta é 2600").
That specificity is the point — "bata a meta" is what the first prompt already
said.

**The checks are soft.** Unlike an invalid catalog index, which cannot be
persisted at all, a plan 8% over on calories is a real plan a coach fixes in
thirty seconds. So a violation that survives the repair is **delivered as a
draft anyway**: the credit is already spent, and handing back nothing is the
worse of the two outcomes.

- **One main carbohydrate per meal.** Pão com aveia, arroz com aveia, arroz com
  batata — a plate the macros will never reveal. The naive "two
  carbohydrate-dense rows" test flags arroz com feijão, the most ordinary
  Brazilian lunch there is, so the check uses TACO's groups instead: cereals
  count, legumes and fruit do not, and a vegetable counts only above 15 g of
  carbohydrate per 100 g (TACO files potatoes next to broccoli).

### Medidas caseiras

The food catalog line carries the platform's default household portion where the
food has one — `[1 fatia = 25g]` — and the model answers with a whole `measures`
count alongside the grams. A diet written in grams for foods nobody weighs is a
diet nobody follows.

The server **recomputes grams from the count** rather than trusting both: a
model that says "2 fatias, 60 g" for a 25 g slice has said two different things,
and the count is the one the aluno acts on. Only platform measures
(`clinic_id IS NULL`, `is_default`) enter the block — a clinic's own portion
would make the prefix differ per tenant and cost every clinic its cache hit.

## Generation flow

1. **Gate: the aluno needs a `filled` anamnese.** The button is *disabled with an
   explanation*, never hidden. Generating a diet without weight or age produces
   confident nonsense, and this is health-adjacent output going to a real person.
   The useful side effect: the AI button becomes the strongest reason a coach has
   ever had to actually send anamneses out.
2. **Gate: credits remaining this month.**
3. **The dialog asks a different form per kind.** Treino: objective, equipment
   available, days per week. Dieta: objective, dietary restrictions, the day's
   meals, plus the optional answers below. The required fields are **prefilled
   where the app already knows** (`objective` from the aluno's goal, the counts
   and the everyday five meals from their defaults), so "required" means
   confirmed rather than retyped. Equipment and restrictions are *not* in the
   anamnese at all, which is exactly why they are asked here.

   The dieta form carries four things the treino has no equivalent of:

   - **The day's meals** — see [Describing the day](#describing-the-day) below.
   - **Preferências / Evitar**, free text. `restrictions` is four coded diets;
     these are "gosta de tapioca" and "odeia jiló" — what will actually get
     eaten, and the specific aversions no checkbox list will ever cover.
   - **Perfil de macros** — alta proteína, alto carboidrato, baixo carboidrato,
     baixa gordura; none to several, and combining them is the point (alta
     proteína com baixo carbo is the classic cut). This is the answer most
     coaches actually have: very few carry "180 g de proteína, 60 g de gordura"
     for every aluno, nearly all of them know they want this one high in protein
     and low in carbohydrate. Without it that intent had two outlets, both bad —
     invent four numbers, or write it into the free-text objective and hope the
     model read it as a macro instruction. Each profile reaches the prompt as a
     **number**, not an adjective (`~2,2 g/kg`, `≤25% das calorias`, fat "perto
     de 20% e nunca abaixo"), because "alto carboidrato" alone lets the model
     settle on whatever its training data called high — which is how two
     generations for the same aluno come back different with no reason the coach
     can see. There is deliberately **no "baixa proteína"**: nobody prescribes
     it, and offering it would make the low end look like a legitimate goal.

     Two combinations are refused, in the schema and in the dialog: **alto +
     baixo carbo** (a straight contradiction) and **baixo carbo + baixa
     gordura** — the subtler one, and the reason the check is a list rather
     than an either/or, since cutting both leaves protein carrying the whole
     day's calories.
   - **Metas** (kcal, protein, carbs, fat), each optional and each independent.
     Blank means "work it out from the anamnese", which is the honest default —
     most coaches do not carry a kcal figure for every aluno. Given, it is a
     hard target (±5%), and only the ones given reach the prompt: sending the
     blanks as zero would turn "no opinion" into "zero grams of fat". A gram
     target **wins over the profile** for its macro, and the prompt says so —
     "alta proteína" and "150 g de proteína" are not a contradiction the model
     should be left to resolve on its own.
   - **Recomeçar do zero**, default **off**. With it off and a diet already on
     file, that diet is sent as a baseline and the model is told to *adjust* it —
     keep the foods and the times, move only what the objective requires. A
     monthly review is an adjustment, not a new prescription: a coach who has
     spent three cycles learning that this aluno eats the tapioca and skips the
     salada loses all of it when the model starts from a blank page, and the
     aluno who was adhering is handed a stranger's plan. The baseline is
     rendered as **catalog indices**, so the model reuses the exact same rows
     rather than a similar-looking food; a food no longer in the catalog is
     listed, marked, and declared unusable rather than dropped silently.

### Describing the day

The meals are a **named list**, not a count — `MEAL_SLOT_VALUES` in
`src/lib/meals.ts`, the same eight slots the diet builder's suggestion chips
offer (they used to be two hand-maintained lists, and had already drifted: the
builder offered Pré-treino and the generator could not produce it). Each slot
carries a label, an indicative clock time and a **kind** — what food belongs in
it — and the kind is what lets the prompt refuse arroz-e-feijão at 07:00. Pré and
pós-treino are deliberately **out** of the default: they only make sense next to
a session, and generating them unasked hands every sedentary aluno two meals
they do not need.

A coach can describe the day in any of three ways, and all three are answers
people actually give:

| Ticked meals | Total (`mealsPerDay`) | What the model is told |
| --- | --- | --- |
| yes | blank | build exactly these, in this order |
| none | a number | build this many, choosing from the full slot menu |
| yes | a number | the ticked ones are mandatory, fill the rest up to the total |

Neither given is refused (the day has to be pinned down somehow), and so is a
total below the meals already ticked — three named meals inside a two-meal day
is not a shape anyone can build, and the dialog says so before a credit is
spent. In the two modes that don't name every slot, the prompt still ships the
**full menu with kinds and times**, so even "6 refeições" leaves the model
picking from real slots instead of inventing a split.

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
- **OpenAI-compatible `/chat/completions`** is the seam, and **OpenRouter** is
  what sits behind it: one key fronting nearly every vendor, so choosing a model
  is a config change rather than an account, a contract and an integration. The
  wire format is the one we already spoke, so the aggregator costs no dependency
  surface and nothing stands between us and a provider's error messages.
  `LLM_BASE_URL` still exists — pointing it at a vendor directly keeps working,
  because the OpenRouter-only fields are ignored by endpoints that don't know
  them.
- **Unconfigured degrades to "feature off"**, never to a 500: the route answers a
  friendly *"IA não configurada"* and spends no credit.
- **Tested against the `dev` provider**, plus an injectable fake for happy-path
  integration tests, plus pure unit tests over the request body and the response
  parser (`tests/llm-provider.test.ts`). No HTTP-mocking dependency — the suite
  has none today.
- **Prompt order: catalog first, anamnese and form last**, so the volatile part
  never sits inside the cacheable span.

### Configuration

**Two env vars, and neither of them is the model.**

| Var | Default | What it decides |
| --- | --- | --- |
| `LLM_API_KEY` | — | Set it or the feature is off. The only switch. |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Optional. The endpoint, minus `/chat/completions`. |

**The model lives in `ai_settings`, edited at `/admin/ai → Modelos`** — a single
row holding the primary slug and an ordered fallback list. That is the one
decision about this feature that gets revisited: prices move, slugs get retired,
and the whole point of an aggregator is that trying another model should be
cheap. As an env var that is a deploy; as a row it is a form, and it takes effect
on the **next generation**. The key stays in the environment because it is a
secret, and secrets do not belong in a table an admin screen reads back.

With **no row saved**, the coded defaults in `src/lib/ai-settings.ts` apply, so a
fresh install generates without anyone seeding or saving anything. The screen
says which of the two you are looking at.

Everything else is a **constant** in `src/lib/llm-provider.ts` — temperature
(0.4), output ceiling (8000), timeout (90s). A knob nobody turns is only a way to
be misconfigured, and each of these was one.

Three decisions worth knowing, because each reverses something or looks like an
omission:

- **There is a default model now**, reversing the original "no default model
  string" rule. That rule existed because a hardcoded id is a latent 404 that
  fails *after* a credit is at stake. Two things defused it: a **fallback list**
  means a retired primary degrades instead of taking the feature down, and an
  **aggregator** means "try another model" is no longer "open an account". What
  survives: verify a slug against `curl https://openrouter.ai/api/v1/models`
  before trusting it — which is now a form field, not a code edit.
- **`:floor` is the cost lever**, and it lives in the model slug: it is exactly
  `provider.sort: "price"`, expressed per-model so it survives into the fallback
  list. The form warns when a slug lacks it, because the suffix is the easiest
  thing to lose when pasting off a vendor page and it is worth roughly an order
  of magnitude.
- **No routing preferences are sent at all** — in particular not
  `provider.require_parameters`, which would route only to hosts supporting
  strict `json_schema`. As of 2026-08 that excludes every cheap host and, for the
  default primary, leaves **no eligible host at all**. Without it, a host that
  can't do strict schemas falls back to its own JSON mode and the answer is
  caught by zod plus the free repair retry: a slightly higher repair rate for
  roughly 9× on price. See `docs/ai-provider-costs.md`.

**Defaults: Qwen3.7 Flash, falling back to Llama 3.1 8B**, both floored. See
`docs/ai-provider-costs.md` for the verified prices and the still-open LGPD
question — which the aggregator makes cheap to answer (a different slug) rather
than answering.

## The audit row (`ai_generation`)

Both the quota meter and the cost ledger. Per row: `clinicId` (tenant key),
`studentId`, `coachId`, `kind`, `status`, `provider`, `model`,
`upstreamProvider`, `requestId`, token counts (including **cached** and
**cache-write** input separately), `reportedCostMicroUsd`, `durationMs`,
`repaired`, `errorCode`, **`catalogHash`** and **`anamnesisSnapshotId`**.

- **`model` is overwritten on settle, not just recorded.** The `pending` row
  names the model we *asked* for; a fallback can promote a different one. Pricing
  tokens against a slug that did not produce them would be wrong in exactly the
  direction nobody checks.
- **`upstreamProvider` is why a cost can move without a config change.** One slug
  is served by several hosts at different prices, and routing picks per call.
- **The reported cost is a measurement, not the frozen price 0032 dropped.**
  That number came from `LLM_PRICE_*` env vars nobody set, so it could only ever
  restate an assumption and only ever say `NULL`. `reportedCostMicroUsd` is
  returned *by the call*, in the same class of fact as the token counts beside
  it, and it is the only figure that stays right when routing moves a slug
  between hosts.
- **`provider_price` is unchanged and still prices every row.** It covers rows
  from before the switch and vendors that report nothing, it is what makes a
  *forecast* possible, and it stays correctable after the fact. Where a row has
  both, **the reported figure wins** — it is the one the invoice will agree with.
- **A failed call still records what it cost.** A refusal or a truncated answer
  refunds the credit; it does not refund the tokens. Recording the spend on the
  `failed` row is what keeps a model that burns tokens without producing a
  program from looking free.
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
| Model never priced | Its generations read as unpriced — unless the provider reported a cost, in which case nothing is missing. An honest "unknown", and a gap the admin can close on the spot. |
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

### The **Modelos** tab

Choosing a model is a form field now, so the question worth asking is no longer
only "what did this clinic spend" but **"what does this model cost us, and how
often does it need repairing"** — which spans tenants and so has no home on the
per-clinic table.

Before swapping in a slug, check its `reasoning` block in OpenRouter's model
list: a model with `mandatory: true` cannot be stopped from thinking, and
thinking is billed as output and eats the same `max_tokens` ceiling as the
answer — see the hazards in `docs/ai-provider-costs.md`.

- **Custo / geração is the column that compares two models.** A total says more
  about how much a model was used than about what it costs.
- **Reparos as a share of successes is the quality signal that decides a swap.**
  A repair is a second round-trip: a cheap model that needs repairing half the
  time is not cheap.
- **The host column is where a cost that moved shows up first.** One slug served
  by two hosts at two prices, chosen per call by `:floor`.
- **The config card above it says what the server is currently asking for.**
  Without it, a cost that moved and a config someone changed look identical in
  the numbers. It carries no secret — never the key, only whether one is set.

Four details that are not incidental:

- **Every cost figure says whether it was measured or estimated** (`medido` /
  `estimado` / `medido + estimado`). An estimate is only as good as the price
  someone typed; a measured figure is what the invoice will say. A 10% gap
  between two models means nothing until you know you are comparing like with
  like.
- **A partial cost total is labelled `parcial`, never silently summed.** A
  generation that reported no cost *and* has no price entered is uncosted;
  adding it as zero would under-report the bill by exactly the amount you can't
  see. `unpricedGenerations` counts them, and this is a gap the admin can close
  on the spot — the Preços tab is on the same screen. A generation that burned no
  tokens at all is neither costed nor counted as missing: there is nothing to
  cost, so it would only dilute the signal.
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

- **LGPD posture.** The default primary (`qwen/qwen3.7-flash`) is served on
  OpenRouter by **Alibaba and nobody else**, so routing through an aggregator
  did *not* change the jurisdiction — it only made changing it cheap.
  Picking a different slug on `/admin/ai` is now a one-form answer; the
  privacy-policy update and the DPA check are still owed before launch
  (`docs/ai-provider-costs.md`).
- **Existing `provider_price` rows are keyed to the old provider name.** Rows
  entered as `openai-compatible` no longer match generations, which now record
  `openrouter`. Re-enter them under the new name — or leave them: reported costs
  cover every new row, so the estimate only matters for forecasting.
- **Promotion into `docs/monetization.md` §7** (both language halves, plus a
  §4(a) line and a §6.3 margin re-check) still waits — but the prices it needs
  are now verified, and the token counts it assumed are now measured per row.
- **Measured token counts** — the figures quoted in §7 are still arithmetic on
  assumed row sizes. `/admin/ai → Modelos` is where the real ones will come from
  after the first month of use.
