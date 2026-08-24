import "server-only";

import { logger } from "@/server/observability";

/**
 * LLM provider port. Server-only.
 *
 * The application never talks to a model vendor directly — it talks to this
 * interface. Behind it sits **OpenRouter**: one OpenAI-compatible endpoint that
 * fronts nearly every vendor, so choosing a model is a form field rather than a
 * new account. Until a key is configured we ship a `dev` provider that never
 * generates, so every surrounding path — quota accounting, the anamnese gate,
 * the audit trail, the friendly "IA não configurada" answer — is fully
 * exercisable locally and in tests.
 *
 * Why an aggregator, and why still no SDK:
 *
 * - **The swap we actually want to make cheaply is "same JSON contract,
 *   different cheap model".** OpenRouter makes that one form field instead of
 *   one integration, which is what turns the open question in
 *   `docs/ai-provider-costs.md` ("choose on pt-BR quality, tested against the
 *   real catalog") into something a person can actually run.
 * - **Its wire format is the OpenAI-compatible `/chat/completions` shape we
 *   already spoke**, so the aggregator costs no dependency surface and nothing
 *   sits between us and a provider's error messages. `LLM_BASE_URL` still
 *   exists: pointing it at a vendor directly keeps working, and the one
 *   aggregator-specific field is simply ignored by vendors that don't know it.
 *
 * **What is configurable, and where.** Only the key and the endpoint come from
 * the environment, because one is a secret and the other is boot-level infra.
 * The models come from `ai_settings`, edited at `/admin/ai` — that is the single
 * decision about this feature that gets revisited. Everything else below is a
 * constant, because a knob nobody turns is only a way to be misconfigured.
 *
 * One capability covers everything the generator needs: ask for **JSON matching
 * a schema** and get it back, or get a typed reason why not. No streaming, no
 * tool-calling, no conversation state — a program draft is one request and one
 * structured answer.
 */

/** What we ask a model for: prompts plus the JSON shape the answer must take. */
export type LlmJsonRequest = {
  /**
   * Role/rules prompt. PT-BR — the domain vocabulary is Portuguese.
   *
   * Carries the catalog block, so it is the **cacheable prefix**: it must be
   * byte-identical across every generation of this kind. Nothing per-aluno may
   * appear here.
   */
  system: string;
  /** The per-aluno task: anamnese + the coach's form. Deliberately last. */
  user: string;
  /** Schema name reported to the provider (some require an identifier). */
  schemaName: string;
  /** JSON Schema the response must satisfy. Enforced again by zod on our side. */
  schema: Record<string, unknown>;
};

/**
 * Why a generation could not be produced. These map to
 * `ai_generation.error_code` and to a PT-BR message at the route; they are
 * deliberately coarse, because the coach can act on "tente de novo" and nothing
 * finer.
 */
export type LlmFailureReason =
  | "not_configured"
  | "timeout"
  | "http"
  | "invalid_json"
  | "refused";

/**
 * Token usage as the provider reported it, plus what it says the call cost.
 * Any field is `null` when the provider reports nothing for it.
 */
export type LlmUsage = {
  /** Input tokens billed at the full rate (i.e. excluding cache hits). */
  inputTokens: number | null;
  /** Input tokens served from the provider's prompt cache. */
  cachedInputTokens: number | null;
  /** Input tokens written *into* the cache — billed at a premium by some. */
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  /**
   * What the provider says it actually charged, in **micro-USD**.
   *
   * This is a measurement, not an estimate — the same class of fact as the token
   * counts, and the only figure that survives routing. `provider_price` still
   * exists and still prices every row: it is what makes a *forecast* possible
   * and what covers vendors that report no cost at all. Where both exist the
   * reported figure wins, because it is the one the invoice will agree with.
   */
  reportedCostMicroUsd: number | null;
};

/** Who actually served a call — known only after it returns. */
export type LlmCall = {
  /**
   * The model that answered. **Not necessarily the one we asked for**: with a
   * fallback list configured, a rate-limited or retired primary silently
   * promotes the next slug, and the audit row has to say which one ran or its
   * token counts are priced against the wrong rate.
   */
  model: string;
  /**
   * The upstream provider the aggregator routed to (e.g. "Groq", "DeepInfra"),
   * when it says. Best-effort: it is a vendor extension on top of the
   * OpenAI-compatible envelope, so a direct vendor endpoint won't send it at
   * all — a miss reads as `null` rather than failing.
   */
  upstreamProvider: string | null;
  /** The provider's own id for the call, for looking it up in its dashboard. */
  requestId: string | null;
};

export type LlmResult =
  | {
      ok: true;
      /** Parsed JSON. Shape is *not* guaranteed — the caller validates with zod. */
      json: unknown;
      usage: LlmUsage;
      call: LlmCall;
    }
  | {
      ok: false;
      reason: LlmFailureReason;
      message: string;
      /**
       * Present when the call reached a model and came back unusable — a
       * truncated answer or a refusal still burns tokens and still appears on
       * the invoice, so it is recorded rather than written off as free.
       */
      usage?: LlmUsage;
      call?: LlmCall;
    };

export type LlmProvider = {
  /** Stable id, e.g. "dev" | "openrouter". Recorded on every row. */
  readonly name: string;
  /** Whether this provider can actually reach a model (false for `dev`). */
  readonly canGenerate: boolean;
  /** Model identifier we ask for, recorded before the call as the intent. */
  readonly model: string;
  generateJson(request: LlmJsonRequest): Promise<LlmResult>;
};

/* -------------------------------------------------------------------------- */
/* Constants — deliberately not configurable                                  */
/* -------------------------------------------------------------------------- */

/** The aggregator, unless `LLM_BASE_URL` points somewhere else. */
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Request timeout. Generous — a program draft is a long completion. */
const TIMEOUT_MS = 90_000;

/** Hard ceiling on generated tokens. Empty output is a failure, not a draft. */
export const MAX_OUTPUT_TOKENS = 8000;

/**
 * Low but non-zero: programs should vary a little between regenerations (a coach
 * who dislikes a draft asks again), while staying disciplined about the catalog.
 */
const TEMPERATURE = 0.4;

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** The two things that come from the environment. */
export type LlmEnv = { apiKey: string; baseUrl: string };

/** The two things that come from `ai_settings`. */
export type LlmModels = { model: string; fallbackModels: string[] };

/**
 * Reads the environment. `null` — meaning "feature off" — when there is no API
 * key, which is the only required value.
 */
export function llmEnv(): LlmEnv | null {
  const trim = (v?: string) => (v ?? "").trim();
  const apiKey = trim(process.env.LLM_API_KEY);
  if (!apiKey) return null;
  return {
    apiKey,
    // Trailing slashes are the classic copy-paste error; strip so the request
    // path never doubles up.
    baseUrl: (trim(process.env.LLM_BASE_URL) || DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    ),
  };
}

/** Whether a real provider is configured — checked before spending a credit. */
export function isLlmConfigured(): boolean {
  return llmEnv() !== null;
}

/* -------------------------------------------------------------------------- */
/* Implementations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The local/dev/test provider: refuses, loudly but harmlessly. It never pretends
 * to have generated something, because a fabricated workout is worse than no
 * workout — the caller answers "IA não configurada" and no credit is spent.
 */
const devProvider: LlmProvider = {
  name: "dev",
  canGenerate: false,
  model: "none",
  async generateJson() {
    logger.warn("llm.not_configured");
    return {
      ok: false,
      reason: "not_configured",
      message: "Nenhum provedor de IA configurado (defina LLM_API_KEY).",
    };
  },
};

/** The request body, split out so a test can assert on it without a network. */
export function buildRequestBody(
  models: LlmModels,
  request: LlmJsonRequest,
): Record<string, unknown> {
  return {
    model: models.model,
    // Model-level failover: the primary leads the list, the rest are tried in
    // order when it errors, rate-limits or has been retired. Omitted entirely
    // when no fallbacks are configured, so a direct vendor never sees a field
    // it doesn't understand.
    ...(models.fallbackModels.length > 0
      ? { models: [models.model, ...models.fallbackModels] }
      : {}),
    temperature: TEMPERATURE,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Thinking off. Reasoning tokens are billed as *output* tokens and share
    // the `max_tokens` ceiling with the answer, so a thinking model spends the
    // budget deliberating and gets cut off mid-JSON — a full-price call that
    // returns nothing. Several cheap models (Qwen3.x among them) report
    // `reasoning.default_enabled: true` in OpenRouter's model list, so this has
    // to be switched off explicitly rather than assumed.
    //
    // It is off for the task, not just for the bill: the model is picking rows
    // out of a catalog it was handed and filling in a fixed schema. There is no
    // chain of thought to have, and output tokens cost ~4x input here.
    reasoning: { enabled: false },
    // The strict-structured-output field. Hosts that don't implement it fall
    // back to their own JSON mode; either way zod re-validates, so a host that
    // honours neither is caught rather than trusted.
    //
    // Note we do NOT ask the aggregator to route only to hosts that support it
    // (`provider.require_parameters`): as of 2026-08 that excludes every cheap
    // host and can leave a model with no eligible host at all. See
    // docs/ai-provider-costs.md.
    response_format: {
      type: "json_schema",
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    messages: [
      // The catalog rides in `system`, first, so it forms the cacheable prefix;
      // the per-aluno payload is last and never cached.
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
  };
}

/** The shape we read back. Everything optional — providers differ in what they say. */
type ChatCompletionPayload = {
  id?: string;
  model?: string;
  /** The upstream host that served the call, e.g. "DeepInfra". */
  provider?: unknown;
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

/**
 * The upstream host that served the call, from the response's top-level
 * `provider` field ("DeepInfra", "Groq", "Alibaba").
 *
 * Read defensively: this is a vendor extension on top of the OpenAI-compatible
 * envelope, so a direct vendor endpoint simply won't send it, and a rename must
 * cost us a `null` in one audit column rather than a failed generation.
 */
export function readUpstreamProvider(payload: {
  provider?: unknown;
}): string | null {
  const provider = payload.provider;
  if (typeof provider !== "string") return null;
  const trimmed = provider.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The slice of the output tokens the model spent thinking, when it says.
 *
 * Not persisted — it is a diagnostic, not an accounting fact: it is already
 * inside `completion_tokens` and is priced there. It is logged because a model
 * that quietly starts thinking again (a new slug, a routing change, a provider
 * default) presents as "truncated output" with no other clue, which is exactly
 * the failure this codebase already paid for once.
 */
export function readReasoningTokens(payload: ChatCompletionPayload): number | null {
  return payload.usage?.completion_tokens_details?.reasoning_tokens ?? null;
}

/** Reads usage + cost off a response, tolerating every field being absent. */
export function readUsage(payload: ChatCompletionPayload): LlmUsage {
  // `prompt_tokens` is the total; the cached slice is reported separately and
  // must be subtracted so the two don't double-count in the cost.
  const promptTokens = payload.usage?.prompt_tokens ?? null;
  const cached = payload.usage?.prompt_tokens_details?.cached_tokens ?? null;
  const cost = payload.usage?.cost;
  return {
    inputTokens: promptTokens === null ? null : Math.max(0, promptTokens - (cached ?? 0)),
    cachedInputTokens: cached,
    cacheWriteTokens: payload.usage?.prompt_tokens_details?.cache_write_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
    // Credits are USD. Rounded to micro-USD to match `provider_price`'s integer
    // money rule — a generation costs hundreds of micro-USD, so the rounding is
    // four orders of magnitude below the figure.
    reportedCostMicroUsd:
      typeof cost === "number" && Number.isFinite(cost) ? Math.round(cost * 1_000_000) : null,
  };
}

/**
 * The OpenRouter / OpenAI-compatible provider: one `POST /chat/completions`
 * against whatever `LLM_BASE_URL` points at.
 */
function buildHttpProvider(env: LlmEnv, models: LlmModels): LlmProvider {
  return {
    name: "openrouter",
    canGenerate: true,
    model: models.model,
    async generateJson(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const startedAt = Date.now();
      try {
        const response = await fetch(`${env.baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.apiKey}`,
          },
          body: JSON.stringify(buildRequestBody(models, request)),
        });

        if (!response.ok) {
          // The body can echo prompt content, so it is logged server-side for
          // debugging but never returned to the caller or persisted.
          const body = await response.text().catch(() => "");
          logger.error("llm.http_error", {
            status: response.status,
            model: models.model,
            body: body.slice(0, 500),
          });
          return {
            ok: false,
            reason: "http",
            message: `Provedor respondeu ${response.status}.`,
          };
        }

        const payload = (await response.json()) as ChatCompletionPayload;
        const usage = readUsage(payload);
        const call: LlmCall = {
          // The model that answered, which is the one the row must be priced
          // against. Falls back to what we asked for when nothing is echoed.
          model: payload.model?.trim() || models.model,
          upstreamProvider: readUpstreamProvider(payload),
          requestId: payload.id?.trim() || null,
        };

        // The usage line: one structured record per call, so cost and routing
        // are answerable from logs alone when the database is not to hand.
        logger.info("llm.call", {
          asked: models.model,
          served: call.model,
          upstream: call.upstreamProvider,
          requestId: call.requestId,
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          reasoningTokens: readReasoningTokens(payload),
          costMicroUsd: usage.reportedCostMicroUsd,
          durationMs: Date.now() - startedAt,
        });

        const choice = payload.choices?.[0];
        const content = choice?.message?.content;
        if (!content) {
          return {
            ok: false,
            reason: "refused",
            message: "O modelo não retornou conteúdo.",
            usage,
            call,
          };
        }
        // A truncated answer is almost always invalid JSON anyway, but saying so
        // explicitly turns a confusing parse error into an actionable one.
        if (choice?.finish_reason === "length") {
          // A valid draft is ~1-2k tokens, so hitting the ceiling means
          // something spent the budget on something other than the answer.
          // Three causes look identical from the outside and are told apart by
          // exactly the fields below, so all three are logged rather than
          // guessed at a second time:
          //
          // - `reasoningTokens` high  → the model is thinking despite
          //   `reasoning: { enabled: false }`, i.e. the host ignored the field.
          // - `contentChars` small    → the budget went somewhere other than
          //   the content; with no reasoning reported, the host is billing for
          //   output it isn't returning.
          // - `contentChars` large    → a genuine runaway: it improvised past
          //   the schema. `tail` shows whether it looped or is just verbose,
          //   which `head` alone cannot (the head of a runaway looks perfect).
          //
          // Bounded, server-side only, never returned or persisted — the same
          // posture as the HTTP error body above, since this echoes prompt
          // content.
          logger.error("llm.truncated", {
            model: call.model,
            upstream: call.upstreamProvider,
            maxTokens: MAX_OUTPUT_TOKENS,
            outputTokens: usage.outputTokens,
            reasoningTokens: readReasoningTokens(payload),
            contentChars: content.length,
            head: content.slice(0, 300),
            tail: content.slice(-300),
          });
          return {
            ok: false,
            reason: "invalid_json",
            message: "A resposta do modelo foi truncada (max_tokens).",
            usage,
            call,
          };
        }

        try {
          return { ok: true, json: JSON.parse(content), usage, call };
        } catch {
          return {
            ok: false,
            reason: "invalid_json",
            message: "O modelo não retornou JSON válido.",
            usage,
            call,
          };
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        logger.error("llm.request_failed", {
          err: error,
          aborted,
          model: models.model,
        });
        return aborted
          ? {
              ok: false,
              reason: "timeout",
              message: "O provedor de IA demorou demais para responder.",
            }
          : {
              ok: false,
              reason: "http",
              message: "Não foi possível falar com o provedor de IA.",
            };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Resolves the active provider: the HTTP one when a key is set, else the no-op
 * `dev` one. Falling back rather than throwing is deliberate — an unconfigured
 * install must degrade to "feature off", never to a 500.
 *
 * The models are **passed in**, not read here: they live in `ai_settings`, and
 * this module stays free of database access so the request body and the response
 * parser remain pure functions a unit test can reach.
 *
 * To switch the feature off without changing anything else, unset `LLM_API_KEY`.
 */
export function getLlmProvider(models: LlmModels): LlmProvider {
  const env = llmEnv();
  return env ? buildHttpProvider(env, models) : devProvider;
}
