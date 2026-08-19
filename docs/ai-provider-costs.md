# AI provider costs — research note (roadmap item 1)

> **Status: partly verified. Original capture 2026-08-16; OpenRouter figures
> captured live 2026-08-18 from `https://openrouter.ai/api/v1/models`.**
>
> The §"Candidates" table below is the **original, unverified** research: every
> price in it except the Anthropic row came from search-result summaries of
> aggregator sites that could not be opened, because that session's network
> policy blocked every vendor pricing domain. Treat it as order of magnitude.
>
> §"Verified — via OpenRouter" is different: those figures come from the
> aggregator's own model API, per host, and are quotable.

## The switch to OpenRouter (2026-08-18)

The generator now goes through **OpenRouter** rather than calling a vendor
directly. Nothing about the cost conclusion changed; what changed is that the
open question this note ends on — *"choose on pt-BR quality and structured-output
reliability, tested against the real catalog"* — became something a person can
actually run. One key resolves every slug, so trying five models is five saves
on an admin form, not five signups.

**What it costs:** OpenRouter passes provider rates through with **no per-token
markup** and charges **5.5% when credits are bought** ($0.80 minimum; 5% for
crypto). At the volumes below that is a rounding error on a rounding error.

**What it buys, beyond model shopping:**

- **A fallback list.** An ordered list of alternates means a retired or
  rate-limited primary degrades to the next slug instead of taking the feature
  down. This is what made a *default* model string defensible after the original
  decision explicitly forbade one.
- **`:floor`.** Appended to a slug it means "cheapest host serving this model" —
  exactly `provider.sort: "price"`, expressed per-model so it survives into the
  fallback list.
- **A reported cost per call.** The response carries `usage.cost`: what was
  actually charged, which is now recorded on every `ai_generation` row. The
  `provider_price` estimate no longer has to carry the whole ledger.
- **A jurisdiction lever.** Changing the slug is a form field, so moving off a
  jurisdiction is a save rather than a migration.

## Verified — via OpenRouter, 2026-08-18

$/1M tokens, per **host**, from the aggregator's model API. `Strict` = the host
advertises `structured_outputs` (strict `json_schema`), which is what the
generator asks for.

**`qwen/qwen3.7-flash`** — 1M context:

| Host | In | Out | Cache read | Cache write | Strict |
|---|---:|---:|---:|---:|---|
| Alibaba | 0.03 | 0.13 | 0.006 | 0.038 | no |

**`meta-llama/llama-3.1-8b-instruct`**:

| Host | In | Out | Context | Strict |
|---|---:|---:|---:|---|
| DeepInfra | 0.02 | 0.04 | 131k | no |
| Novita | 0.02 | 0.05 | **16k** | no |
| Groq | 0.05 | 0.08 | 131k | no |
| Cloudflare | 0.152 | 0.287 | 32k | no |
| CoreWeave | 0.22 | 0.22 | 128k | **yes** |

Per generation at the assumed 10k in + 3k out:

| Model · host | Per generation |
|---|---:|
| Llama 3.1 8B · DeepInfra (`:floor`) | US$0.00032 |
| Qwen3.7 Flash · Alibaba (only host) | US$0.00069 |
| Llama 3.1 8B · Groq | US$0.00074 |
| Llama 3.1 8B · CoreWeave (only strict host) | US$0.00286 |

**Three findings that changed the configuration**, all of them things the
original unverified table could not have shown:

1. **Almost nothing cheap does strict JSON schemas.** Neither default model has a
   cheap host advertising `structured_outputs`. Forcing it
   (`provider.require_parameters`) would exclude every cheap host and, for
   Qwen3.7 Flash, leave **no eligible host at all** — the request simply fails.
   So we never send it: a host without strict schemas falls back to its own
   JSON mode, and the answer is caught by zod plus the free repair retry. That
   trade is a slightly higher repair rate against roughly **9×** on price
   (CoreWeave vs DeepInfra). Revisit if repairs turn out to be common —
   `/admin/ai → Modelos` reports the rate per model, which is precisely the
   measurement that decides it.
2. **Routing through an aggregator did not move the jurisdiction.** On
   OpenRouter, `qwen/qwen3.7-flash` is served by **Alibaba and nobody else**, so
   the open LGPD risk below is unchanged by the switch — only made *cheap to
   answer*: pick a different slug on the admin screen.
3. **`:floor` can route to a host that cannot hold the prompt.** Novita serves
   Llama 3.1 8B at the floor price with a **16k** context, against a catalog
   prefix in the same order of magnitude. Model-level fallback triggers on
   context-length errors, so the failure mode is a slower call rather than a
   dead feature — but it is the reason a fallback list is configured rather than
   left empty.

## Chosen defaults

```
principal:    qwen/qwen3.7-flash:floor
alternativas: meta-llama/llama-3.1-8b-instruct:floor
```

Cheapest-first, floored, with a fallback of a different family and a different
jurisdiction. These are the coded defaults in `src/lib/ai-settings.ts`, applied
until an admin saves anything at **`/admin/ai → Modelos`**, which is where they
are changed — not in the environment.

Both slugs must be **re-verified against the live model list** before being
trusted (`curl https://openrouter.ai/api/v1/models`). That is the surviving half
of the old "no default model string" rule, and the reason they are a row on a
form rather than a constant someone edits code to change.

## Why this note exists

Roadmap item 1 (AI Program Generator) meters a real marginal cost: every
generation is a paid model call. The plan gates it at **Free 1 / Solo 10 /
Clínica 25 per calendar month**, and those numbers need to be defensible.

## Three hazards found while researching

- **`deepseek.ai` is a lookalike.** DeepSeek's real domain is `deepseek.com`.
  Any price sourced from the former was discarded.
- **Model IDs have churned hard.** The lineup below (GPT-5.6, Gemini 3.x,
  DeepSeek V4, Grok 4.6) post-dates the assistant's training data, and several
  older IDs are reported retired (`deepseek-chat` in July 2026; GPT-5 nano).
  **Never hardcode a model string from memory** — this is the direct reason the
  planned `LlmProvider` port requires `LLM_MODEL` explicitly instead of
  defaulting to one. *(That var is gone: the model is a row edited at
  `/admin/ai`. The reasoning still holds — see the top of this note for what
  defused it.)*
- **Cheap models think by default, and thinking is billed as output.**
  (Found the hard way, 2026-08-19.) `qwen/qwen3.7-flash` reports
  `reasoning.default_enabled: true` in `GET /api/v1/models`; reasoning tokens
  count as completion tokens *and* draw down the same `max_tokens` ceiling as
  the answer. The result is not a slow call, it is a **failed one at full
  price**: the model deliberates for most of the budget and gets cut off
  mid-JSON. One observed call — 19,311 in, 8,000 out, $0.0016, 54s, nothing
  returned. Fixed by sending `reasoning: { enabled: false }` on every request
  (`buildRequestBody`), which is right for the task anyway: the model is picking
  numbers out of a catalog it was handed and filling in a fixed schema.

  **Check before switching the model at `/admin/ai`:** a slug whose
  `reasoning.mandatory` is `true` cannot be told to stop and will reject
  `enabled: false` outright, so it is unusable here regardless of its headline
  price. `reasoningTokens` now rides on every `llm.call` log line so a model
  that starts thinking again is visible immediately rather than presenting as
  mysterious truncation.

## Candidates

$/1M tokens. **↯ = unverified.** OAI-compat = OpenAI-compatible
`/v1/chat/completions`, which is the seam the provider abstraction targets.

| # | Provider · model | In | Out | OAI-compat | Notes |
|---|---|---:|---:|---|---|
| 1 | Ling-2.6-flash ↯ | 0.010 | ? | ? | Cheapest input found; output price unknown |
| 2 | Alibaba Qwen3.7 Flash ↯ | 0.03 | 0.13 | Yes | Cheapest complete pair found |
| 3 | Groq · Llama 3.1 8B ↯ | 0.05 | 0.08 | Yes | Groq ships an OAI-compatible SDK |
| 4 | OpenAI GPT-5 nano ↯ | 0.05 | ? | Native | Reported delisted — verify it still exists |
| 5 | Google Gemini 2.5 Flash-Lite ↯ | 0.10 | 0.40 | Yes | **Retiring 2026-10-16** |
| 6 | Mistral Small 3.2 ↯ | 0.10 | ? | Yes | Output price unknown |
| 7 | DeepSeek V4-Flash ↯ | 0.14 | 0.28 | Yes | Cache-hit input **0.0028** (−98%); 1M ctx |
| 8 | Fireworks · GPT-OSS 120B ↯ | 0.15 | 0.60 | Yes | Open-weight hosting |
| 9 | OpenAI GPT-5.6 Luna ↯ | 0.20 | 1.20 | Native | |
| 10 | OpenAI GPT-5.4 Nano ↯ | 0.20 | 1.25 | Native | |
| 11 | Google Gemini 3.1 Flash-Lite ↯ | 0.25 | 1.50 | Yes | Successor once 2.5 FL retires |
| 12 | Google Gemini 3.5 Flash-Lite ↯ | 0.30 | 2.50 | Yes | |
| 13 | xAI Grok 4.3 ↯ | 1.25 | 2.50 | Yes | |
| 14 | **Anthropic Claude Haiku 4.5** | **1.00** | **5.00** | Via shim | 200K ctx. **Verified** (Anthropic's own reference) |
| 15 | OpenRouter ↯ | — | — | Yes | Aggregator: one endpoint, many models, small markup |

**DeepSeek caveat:** a new peak/off-peak schedule was reported to take effect
16:00 UTC on 2026-08-16 — the day these figures were captured. Re-check before
using any DeepSeek number.

## Cost per generation

Assumed workload: **10k input + 3k output tokens** (catalog subset + anamnese in,
structured JSON program out). At **USD/BRL 5.21** ↯ (2026-08-14, unverified —
Banco Central was unreachable).

| Model | Per generation | 1,000 generations/mo |
|---|---:|---:|
| Qwen3.7 Flash ↯ | US$0.00069 · R$0.0036 | R$3.60 |
| Groq Llama 3.1 8B ↯ | US$0.00074 · R$0.0039 | R$3.90 |
| DeepSeek V4-Flash, 90% cache hit ↯ | US$0.00101 · R$0.0053 | R$5.30 |
| DeepSeek V4-Flash, cold ↯ | US$0.00224 · R$0.0117 | R$11.70 |
| Gemini 2.5 Flash-Lite ↯ | US$0.00220 · R$0.0115 | R$11.50 |
| Fireworks GPT-OSS 120B ↯ | US$0.00330 · R$0.0172 | R$17.20 |
| GPT-5.6 Luna ↯ | US$0.00560 · R$0.0292 | R$29.20 |
| Gemini 3.1 Flash-Lite ↯ | US$0.00700 · R$0.0365 | R$36.50 |
| **Claude Haiku 4.5** (verified) | US$0.02500 · R$0.1303 | R$130.30 |

Formula, to re-run against any price: `cost = 0.01 × input$ + 0.003 × output$`.

## The conclusion — and why it survives the uncertainty

**At the chosen caps, AI is not a meaningful cost line.**

Worst case in the table (Haiku 4.5, the *most* expensive option), with a Clínica
clinic burning all 25 credits every month:

> 25 × R$0.13 = **R$3.26/month** against a **R$379** subscription — **0.9% of revenue.**

Solo at 10 credits on Haiku is R$1.30 against R$179 (**0.7%**). On a
Flash-Lite-class model it is ~R$0.12 (**0.06%**).

For scale, `docs/monetization.md` §4(a) puts WhatsApp at **R$14–47** per customer
per month. **AI lands one to two orders of magnitude below the cheapest existing
infra line.** Even if every unverified price here is wrong by 10×, Clínica AI
stays under 10% of revenue and still below WhatsApp.

Two consequences:

1. **1/10/25 is a product decision, not a cost control.** The caps exist to make
   Free feel insufficient and to give Clínica a reason to exist. They should not
   be argued from a COGS spreadsheet.
2. **Free = 1 costs ~R$0.004–0.13 per free clinic per month** — near enough to
   zero that the real Free-tier risk is abuse volume, not unit cost, and the
   quota already bounds that.

## Caching and batch

- **Prompt caching is the lever that matters here**, because the catalog prefix
  repeats across every generation. Reported: DeepSeek caches automatically
  (cache-hit input ~−98%); OpenAI auto-caches above 1,024 tokens at ~0.1× input;
  Anthropic needs an explicit `cache_control` marker (reads 0.1×, writes 1.25× at
  5-min TTL / 2× at 1h). **Design consequence: put the catalog subset first in
  the prompt and the per-aluno anamnese last**, so the cacheable prefix is as
  long as possible. This holds whichever provider wins.
- **Batch (~50% off) is useless for this feature.** OpenAI, Anthropic and Google
  all offer it, but batch means minutes-to-hours latency and a coach is watching
  a spinner. Skip it.

## Brazil / LATAM

- **No provider bills in BRL** — all USD, so FX moves COGS. Immaterial at these
  amounts.
- **No São Paulo inference region** at any candidate.
- **LGPD.** Generations carry aluno health data (age, weight, goals,
  restrictions) to a US provider. Same posture as Sentry (EU region + DPA), but a
  materially more sensitive data class than error traces — it needs a line in the
  privacy policy before launch. The planned candidate-subset design sends
  **catalog IDs and macros rather than names**, which keeps the payload
  effectively pseudonymous almost for free.
- **OpenAI-compatible endpoints are near-universal.** Every candidate except
  OpenAI/Anthropic natively *is* that shape, and both ship shims. This validates
  building a small in-house adapter over `/v1/chat/completions` rather than
  taking on an SDK: swapping providers stays a base-URL + key + model-string
  change.

## Qwen3.7 Flash caching (the chosen provider)

Qwen supports **both** cache modes ↯:

| | Implicit | Explicit |
|---|---|---|
| How | Automatic; detects repeated prefixes | `"cache_control": {"type": "ephemeral"}` |
| Setup | None | Manual placement |
| Write cost | No surcharge | +25% over standard input |
| Hit | Best-effort | Deterministic |
| Saving on hit | ~90% | ~90% |

The explicit syntax is **byte-identical to Anthropic's**, so the provider port
needs no per-vendor branch for caching.

Minimum cacheable length is reported as **~2,000 tokens for Flash** ↯, which
conflicts with Qwen's general context-cache docs (1,024 tokens, cache hits at
20% rather than 10% of unit price). Unresolvable without opening the vendor page;
either way the catalog block clears the threshold comfortably.

**At $0.03/M input, caching here is a latency optimization, not a cost one.**
Full catalog at a rough 16K tokens: ~US$0.0005 cold vs ~US$0.00005 cached — a
saving of roughly R$2/month at a thousand generations. The reason to cache is
time-to-first-token, not money.

## Decision (2026-08-16, superseded 2026-08-18)

**Qwen3.7 Flash**, chosen over Gemini Flash-Lite on cost. The cost difference is
immaterial (both round to ~0% of revenue); the decision was made with the
jurisdiction trade-off stated below explicitly on the table.

> **Superseded in form, not in substance.** Qwen3.7 Flash is still the primary —
> it is now reached through OpenRouter, with Llama 3.1 8B behind it, and the
> figures are verified rather than assumed. See the top of this note.

> **Open risk — LGPD / data residency.** Qwen is Alibaba Cloud. Generations carry
> aluno health data (age, weight, objective, restrictions) to a Chinese-owned
> cloud. This is a heavier data class and a harder jurisdiction than the existing
> Sentry posture (EU region + DPA). **Before launch:** update the privacy policy,
> and check whether a DPA is available. The provider port makes switching to a US
> provider a one-env-var change if the answer is unsatisfactory — the design does
> not depend on this choice.

## What to do with this

**Do not pick a model from the unverified table above.** The verified section at
the top is sourced; that one is not.

The cost analysis says the choice barely matters financially — so choose on
**pt-BR quality and structured-output reliability**, tested against the real
exercise/TACO catalog. That test is now a config change and a restart per
candidate, and `/admin/ai → Modelos` reports cost per generation, repair rate and
cache hit rate side by side for every model that has run. Run the candidates,
read the table, then promote the result into `docs/monetization.md` §7 (EN +
PT-BR halves), plus an AI line in §4(a) and a re-check of the §6.3 margins.
