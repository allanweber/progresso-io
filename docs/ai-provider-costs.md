# AI provider costs — research note (roadmap item 1)

> **Status: UNVERIFIED except where marked. Captured 2026-08-16.**
>
> Every price below except the Anthropic row comes from **search-result summaries
> of aggregator sites that could not be opened** — the research session's network
> policy blocked every vendor pricing domain (`ai.google.dev`,
> `platform.openai.com`, `docs.anthropic.com`, `api-docs.deepseek.com`,
> `openrouter.ai`, `groq.com`, `x.ai`, `mistral.ai`) and every FX source
> including Banco Central. Treat these as **order of magnitude, not quotes.**
>
> This note is deliberately *not* in `docs/monetization.md`. Unverified numbers
> do not belong in the doc that carries the margin model — they get folded into
> §7 there once they can be checked against a vendor page.

## Why this note exists

Roadmap item 1 (AI Program Generator) meters a real marginal cost: every
generation is a paid model call. The plan gates it at **Free 1 / Solo 10 /
Clínica 25 per calendar month**, and those numbers need to be defensible.

## Two hazards found while researching

- **`deepseek.ai` is a lookalike.** DeepSeek's real domain is `deepseek.com`.
  Any price sourced from the former was discarded.
- **Model IDs have churned hard.** The lineup below (GPT-5.6, Gemini 3.x,
  DeepSeek V4, Grok 4.6) post-dates the assistant's training data, and several
  older IDs are reported retired (`deepseek-chat` in July 2026; GPT-5 nano).
  **Never hardcode a model string from memory** — this is the direct reason the
  planned `LlmProvider` port requires `LLM_MODEL` explicitly instead of
  defaulting to one.

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

## Decision (2026-08-16)

**Qwen3.7 Flash**, chosen over Gemini Flash-Lite on cost. The cost difference is
immaterial (both round to ~0% of revenue); the decision was made with the
jurisdiction trade-off stated below explicitly on the table.

> **Open risk — LGPD / data residency.** Qwen is Alibaba Cloud. Generations carry
> aluno health data (age, weight, objective, restrictions) to a Chinese-owned
> cloud. This is a heavier data class and a harder jurisdiction than the existing
> Sentry posture (EU region + DPA). **Before launch:** update the privacy policy,
> and check whether a DPA is available. The provider port makes switching to a US
> provider a one-env-var change if the answer is unsatisfactory — the design does
> not depend on this choice.

## What to do with this

**Do not pick a model from this table.** Build the provider abstraction with no
default model string, then choose at deploy time from a vendor page you can
actually open. The cost analysis says the choice barely matters financially — so
choose on **pt-BR quality and structured-output reliability**, tested against the
real exercise/TACO catalog.

To verify: an admin allowlists the vendor pricing/docs domains for this
workspace, or the pricing pages get pasted in. Either unblocks a live-sourced
rewrite of this note and its promotion into `docs/monetization.md` §7 (EN + PT-BR
halves), plus an AI line in §4(a) and a re-check of the §6.3 margins.
