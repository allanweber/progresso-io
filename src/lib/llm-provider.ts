import { logger } from "@/server/observability";

/**
 * LLM provider port. Server-only.
 *
 * The application never talks to a concrete model vendor directly — it talks to
 * this interface. Which vendor sits behind it (Qwen, Gemini, OpenAI, DeepSeek,
 * a self-hosted model, …) is deliberately undecided and swappable at runtime
 * through `LLM_*` env vars, with **zero** caller changes. Until one is
 * configured we ship a `dev` provider that never generates, so every
 * surrounding path — quota accounting, the anamnese gate, the audit trail, the
 * friendly "IA não configurada" answer — is fully exercisable locally and in
 * tests.
 *
 * Why an in-house port instead of an SDK: the swap we actually want to make
 * cheaply is *"same JSON contract, different cheap model"*, and the
 * OpenAI-compatible `/v1/chat/completions` shape already **is** that industry
 * seam — nearly every cheap provider exposes one. Implementing it directly keeps
 * the swap a config change with no dependency surface and nothing between us and
 * a provider's error messages. Same choice, same reasons, as
 * `whatsapp-provider.ts`.
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
  /** Hard ceiling on generated tokens — the direct cost lever. */
  maxOutputTokens: number;
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

/** Token usage as the provider reported it. `null` when it reports none. */
export type LlmUsage = {
  /** Input tokens billed at the full rate (i.e. excluding cache hits). */
  inputTokens: number | null;
  /** Input tokens served from the provider's prompt cache. */
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

export type LlmResult =
  | {
      ok: true;
      /** Parsed JSON. Shape is *not* guaranteed — the caller validates with zod. */
      json: unknown;
      usage: LlmUsage;
    }
  | { ok: false; reason: LlmFailureReason; message: string };

export type LlmProvider = {
  /** Stable id, e.g. "dev" | "openai-compatible". Recorded on every row. */
  readonly name: string;
  /** Whether this provider can actually reach a model (false for `dev`). */
  readonly canGenerate: boolean;
  /** Model identifier, recorded per generation so costs stay interpretable. */
  readonly model: string;
  generateJson(request: LlmJsonRequest): Promise<LlmResult>;
};

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

/** Request timeout. Generous — a program draft is a long completion. */
const TIMEOUT_MS = 90_000;

/**
 * Reads the provider config, or `null` unless **all three** of key, base URL and
 * model are set (same all-or-nothing shape as `r2Env()`).
 *
 * There is deliberately no default model: model identifiers churn fast enough
 * that a hardcoded one is a latent 404 waiting for the day a vendor retires it,
 * and a wrong default fails at generation time — after a credit is at stake —
 * rather than at boot. Naming the model is the operator's job.
 */
function openAiCompatibleEnv() {
  const trim = (v?: string) => (v ?? "").trim();
  const apiKey = trim(process.env.LLM_API_KEY);
  const baseUrl = trim(process.env.LLM_BASE_URL);
  const model = trim(process.env.LLM_MODEL);
  if (!apiKey || !baseUrl || !model) return null;
  return {
    apiKey,
    // Trailing slashes are the classic copy-paste error; strip so the request
    // path never doubles up.
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

/** Whether a real provider is configured — checked before spending a credit. */
export function isLlmConfigured(): boolean {
  return openAiCompatibleEnv() !== null;
}

/**
 * The OpenAI-compatible provider: one `POST /v1/chat/completions` against
 * whatever `LLM_BASE_URL` points at.
 *
 * `response_format: json_schema` is the strict-structured-output field;
 * providers that don't implement it ignore it and fall back to their own
 * `json_object` semantics. Either way we re-validate with zod, so a provider
 * that honours neither is caught rather than trusted.
 */
function buildOpenAiCompatibleProvider(
  env: NonNullable<ReturnType<typeof openAiCompatibleEnv>>,
): LlmProvider {
  return {
    name: "openai-compatible",
    canGenerate: true,
    model: env.model,
    async generateJson(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(`${env.baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.apiKey}`,
          },
          body: JSON.stringify({
            model: env.model,
            // Low but non-zero: programs should vary a little between
            // regenerations (a coach who dislikes a draft asks again), while
            // staying disciplined about the catalog they were given.
            temperature: 0.4,
            max_tokens: request.maxOutputTokens,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
            messages: [
              // The catalog rides in `system`, first, so it forms the cacheable
              // prefix; the per-aluno payload is last and never cached.
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
          }),
        });

        if (!response.ok) {
          // The body can echo prompt content, so it is logged server-side for
          // debugging but never returned to the caller or persisted.
          const body = await response.text().catch(() => "");
          logger.error("llm.http_error", {
            status: response.status,
            body: body.slice(0, 500),
          });
          return {
            ok: false,
            reason: "http",
            message: `Provedor respondeu ${response.status}.`,
          };
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          };
        };
        const choice = payload.choices?.[0];
        const content = choice?.message?.content;
        if (!content) {
          return {
            ok: false,
            reason: "refused",
            message: "O modelo não retornou conteúdo.",
          };
        }
        // A truncated answer is almost always invalid JSON anyway, but saying so
        // explicitly turns a confusing parse error into an actionable one.
        if (choice?.finish_reason === "length") {
          return {
            ok: false,
            reason: "invalid_json",
            message: "A resposta do modelo foi truncada (max_tokens).",
          };
        }

        // `prompt_tokens` is the total; the cached slice is reported separately
        // and must be subtracted so the two don't double-count in the cost.
        const promptTokens = payload.usage?.prompt_tokens ?? null;
        const cached = payload.usage?.prompt_tokens_details?.cached_tokens ?? null;
        const usage: LlmUsage = {
          inputTokens:
            promptTokens === null ? null : Math.max(0, promptTokens - (cached ?? 0)),
          cachedInputTokens: cached,
          outputTokens: payload.usage?.completion_tokens ?? null,
        };

        try {
          return { ok: true, json: JSON.parse(content), usage };
        } catch {
          return {
            ok: false,
            reason: "invalid_json",
            message: "O modelo não retornou JSON válido.",
          };
        }
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        logger.error("llm.request_failed", { err: error, aborted });
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
 * Resolves the active provider: the OpenAI-compatible one when its three env
 * vars are set, else the no-op `dev` one. Falling back rather than throwing is
 * deliberate — an unconfigured install must degrade to "feature off", never to
 * a 500.
 *
 * To switch the feature off without deleting credentials, unset `LLM_MODEL`.
 */
export function getLlmProvider(): LlmProvider {
  const env = openAiCompatibleEnv();
  return env ? buildOpenAiCompatibleProvider(env) : devProvider;
}
