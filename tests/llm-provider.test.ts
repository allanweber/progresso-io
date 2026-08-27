// @vitest-environment node
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildRequestBody,
  getLlmProvider,
  isLlmConfigured,
  llmEnv,
  MAX_OUTPUT_TOKENS,
  readReasoningTokens,
  readUpstreamProvider,
  readUsage,
  type LlmJsonRequest,
  type LlmModels,
} from "@/lib/llm-provider";
import {
  aiSettingsSchema,
  DEFAULT_AI_FALLBACK_MODELS,
  DEFAULT_AI_MODEL,
  isFloored,
} from "@/lib/ai-settings";
import { costBasis, formatCostBasis } from "@/lib/ai-programs";
import { addUsage, zeroUsage } from "@/server/ai/generate";

/**
 * The provider port's wire format and the settings that drive it.
 *
 * These are the parts that decide **which model answers and what it costs**, and
 * they are all reachable without a network: the request body is built by a pure
 * function and the response is parsed by another. A wrong default here is not a
 * crash — it is a month of generations quietly billed against the wrong model,
 * which is the class of bug that needs a test rather than a review.
 */

const LLM_KEYS = [
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_DEBUG_PROMPTS",
  "LLM_DEBUG_PROMPTS_DIR",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of LLM_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of LLM_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const request: LlmJsonRequest = {
  system: "regras",
  user: "aluno",
  schemaName: "treino",
  schema: { type: "object" },
};

const models: LlmModels = {
  model: DEFAULT_AI_MODEL,
  fallbackModels: DEFAULT_AI_FALLBACK_MODELS,
};

describe("llmEnv", () => {
  it("is null without a key — the feature is off, not broken", () => {
    expect(llmEnv()).toBeNull();
    expect(isLlmConfigured()).toBe(false);
    expect(getLlmProvider(models).canGenerate).toBe(false);
  });

  it("needs nothing but a key: the endpoint defaults to the aggregator", () => {
    process.env.LLM_API_KEY = "sk-or-test";
    expect(llmEnv()).toEqual({
      apiKey: "sk-or-test",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(getLlmProvider(models).name).toBe("openrouter");
  });

  it("strips a trailing slash so the request path never doubles up", () => {
    process.env.LLM_API_KEY = "k";
    process.env.LLM_BASE_URL = "https://example.test/v1///";
    expect(llmEnv()!.baseUrl).toBe("https://example.test/v1");
  });

  it("reports the model it was handed, not one of its own", () => {
    process.env.LLM_API_KEY = "k";
    // The models come from `ai_settings`; this module must never reach for a
    // default of its own, or the audit row and the admin screen would disagree.
    expect(
      getLlmProvider({ model: "a/b", fallbackModels: [] }).model,
    ).toBe("a/b");
  });
});

describe("default models", () => {
  it("are pinned to their cheapest host", () => {
    // `:floor` is one suffix and roughly an order of magnitude in price.
    expect(isFloored(DEFAULT_AI_MODEL)).toBe(true);
    expect(DEFAULT_AI_FALLBACK_MODELS.every(isFloored)).toBe(true);
  });

  it("pass their own validation", () => {
    // A default that the form would reject is a trap for whoever first opens it.
    expect(
      aiSettingsSchema.safeParse({
        model: DEFAULT_AI_MODEL,
        fallbackModels: DEFAULT_AI_FALLBACK_MODELS,
      }).success,
    ).toBe(true);
  });
});

describe("aiSettingsSchema", () => {
  const parse = (model: string, fallbackModels: string[] = []) =>
    aiSettingsSchema.safeParse({ model, fallbackModels });

  it("accepts a vendor/model slug, with or without a variant", () => {
    expect(parse("qwen/qwen3.7-flash").success).toBe(true);
    expect(parse("qwen/qwen3.7-flash:floor").success).toBe(true);
    expect(parse("meta-llama/llama-3.1-8b-instruct:nitro").success).toBe(true);
  });

  it("rejects a bare model name — the vendor prefix is not optional", () => {
    expect(parse("gpt-4").success).toBe(false);
    expect(parse("").success).toBe(false);
  });

  it("accepts an empty fallback list — that is a real choice", () => {
    expect(parse("a/b", []).success).toBe(true);
  });

  it("rejects a duplicated fallback", () => {
    // A repeat is always a mistake: the second attempt would use the model that
    // just failed.
    expect(parse("a/b", ["c/d", "c/d"]).success).toBe(false);
  });

  it("trims, so a pasted slug with stray whitespace still saves", () => {
    const result = parse("  qwen/qwen3.7-flash:floor  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.model).toBe("qwen/qwen3.7-flash:floor");
  });
});

describe("buildRequestBody", () => {
  it("leads the fallback list with the primary model", () => {
    const body = buildRequestBody(models, request);
    expect(body.model).toBe(DEFAULT_AI_MODEL);
    expect(body.models).toEqual([DEFAULT_AI_MODEL, ...DEFAULT_AI_FALLBACK_MODELS]);
  });

  it("omits `models` entirely when no fallback is configured", () => {
    // A direct vendor endpoint must never see a field only the aggregator
    // understands.
    const body = buildRequestBody({ model: "a/b", fallbackModels: [] }, request);
    expect(body).not.toHaveProperty("models");
  });

  it("never sends routing preferences", () => {
    // `:floor` lives in the slug and does the price routing. A `provider` block
    // would be a second place the same decision is expressed.
    expect(buildRequestBody(models, request)).not.toHaveProperty("provider");
  });

  it("asks for a strict JSON schema and puts the catalog first", () => {
    const body = buildRequestBody(models, request);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "treino", strict: true, schema: { type: "object" } },
    });
    // The cacheable prefix has to lead, or the whole catalog design is moot.
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: "regras" });
    expect(messages[1]).toEqual({ role: "user", content: "aluno" });
  });

  it("caps output at the coded ceiling", () => {
    expect(buildRequestBody(models, request).max_tokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("switches thinking off", () => {
    // Reasoning tokens are billed as output and share the `max_tokens` ceiling
    // with the answer, so a model that thinks by default (Qwen3.x reports
    // `reasoning.default_enabled: true`) spends the budget deliberating and is
    // cut off mid-JSON — a full-price call that returns nothing.
    expect(buildRequestBody(models, request).reasoning).toEqual({
      enabled: false,
    });
  });
});

describe("readReasoningTokens", () => {
  it("reads the thinking slice of the output tokens", () => {
    expect(
      readReasoningTokens({
        usage: { completion_tokens: 8_000, completion_tokens_details: { reasoning_tokens: 7_100 } },
      }),
    ).toBe(7_100);
  });

  it("is null when the provider reports nothing", () => {
    // A non-thinking model omits the block entirely; that is "not applicable",
    // not "thought for zero tokens".
    expect(readReasoningTokens({ usage: { completion_tokens: 1_200 } })).toBeNull();
    expect(readReasoningTokens({})).toBeNull();
  });

  it("keeps a reported zero", () => {
    expect(
      readReasoningTokens({ usage: { completion_tokens_details: { reasoning_tokens: 0 } } }),
    ).toBe(0);
  });
});

describe("readUsage", () => {
  it("subtracts cache hits so input tokens are not double-counted", () => {
    const usage = readUsage({
      usage: {
        prompt_tokens: 10_000,
        completion_tokens: 2_000,
        prompt_tokens_details: { cached_tokens: 9_000, cache_write_tokens: 500 },
      },
    });
    expect(usage.inputTokens).toBe(1_000);
    expect(usage.cachedInputTokens).toBe(9_000);
    expect(usage.cacheWriteTokens).toBe(500);
    expect(usage.outputTokens).toBe(2_000);
  });

  it("converts the reported cost from USD to micro-USD", () => {
    expect(readUsage({ usage: { cost: 0.00074 } }).reportedCostMicroUsd).toBe(740);
  });

  it("keeps a reported zero distinct from nothing reported", () => {
    // A free model really does cost nothing; an absent field means we don't
    // know. Collapsing them would make the ledger claim a fact it lacks.
    expect(readUsage({ usage: { cost: 0 } }).reportedCostMicroUsd).toBe(0);
    expect(readUsage({ usage: {} }).reportedCostMicroUsd).toBeNull();
    expect(readUsage({}).inputTokens).toBeNull();
  });
});

describe("readUpstreamProvider", () => {
  it("reads the host the aggregator names on the response", () => {
    // Top-level `provider` on the completion envelope — "DeepInfra",
    // "Groq", "Alibaba". One slug, several hosts, different prices.
    expect(readUpstreamProvider({ provider: "DeepInfra" })).toBe("DeepInfra");
    expect(readUpstreamProvider({ provider: "  Groq  " })).toBe("Groq");
  });

  it("is null rather than throwing when nothing names a host", () => {
    // A vendor extension on top of the OpenAI-compatible envelope: a direct
    // vendor endpoint simply won't send it, and a rename must cost one null
    // column, never a failed generation.
    expect(readUpstreamProvider({})).toBeNull();
    expect(readUpstreamProvider({ provider: "   " })).toBeNull();
    expect(readUpstreamProvider({ provider: 42 })).toBeNull();
    expect(readUpstreamProvider({ provider: { name: "Groq" } })).toBeNull();
  });
});

describe("usage accumulation across a repair", () => {
  const usage = (over: Partial<ReturnType<typeof zeroUsage>> = {}) => ({
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reportedCostMicroUsd: null,
    ...over,
  });

  it("sums both attempts — a repair is free for the coach, not for us", () => {
    const total = addUsage(
      addUsage(zeroUsage(), usage({ inputTokens: 900, outputTokens: 2_000 })),
      usage({ inputTokens: 950, outputTokens: 2_100 }),
    );
    expect(total.inputTokens).toBe(1_850);
    expect(total.outputTokens).toBe(4_100);
  });

  it("leaves cost unknown when no attempt reported one", () => {
    // The dangerous case: 0 here would read as "this model is free", which makes
    // the ledger skip the price-list estimate and zero the cost column behind
    // any endpoint that reports nothing.
    const total = addUsage(zeroUsage(), usage({ inputTokens: 900 }));
    expect(total.reportedCostMicroUsd).toBeNull();
  });

  it("sums the attempts that did report a cost, ignoring those that didn't", () => {
    const total = addUsage(
      addUsage(zeroUsage(), usage({ reportedCostMicroUsd: 400 })),
      usage({ reportedCostMicroUsd: null }),
    );
    expect(total.reportedCostMicroUsd).toBe(400);
  });

  it("keeps a reported zero as zero, not as unknown", () => {
    const total = addUsage(zeroUsage(), usage({ reportedCostMicroUsd: 0 }));
    expect(total.reportedCostMicroUsd).toBe(0);
  });
});

describe("costBasis", () => {
  it("is measured when every costed row reported its own figure", () => {
    expect(costBasis(1000, 1000)).toBe("measured");
    expect(formatCostBasis("measured")).toBe("medido");
  });

  it("is mixed when the price list had to fill some of it in", () => {
    expect(costBasis(1000, 600)).toBe("mixed");
  });

  it("is estimated when nothing was reported", () => {
    expect(costBasis(1000, null)).toBe("estimated");
  });

  it("has nothing to qualify when there is no cost at all", () => {
    expect(costBasis(null, null)).toBe("none");
    expect(formatCostBasis("none")).toBeNull();
  });
});

describe("LLM_DEBUG_PROMPTS", () => {
  const dir = path.join(tmpdir(), "llm-debug-test");

  /** One call against a stubbed endpoint, with the dump switched on. */
  async function callWith(respond: () => Response) {
    rmSync(dir, { recursive: true, force: true });
    process.env.LLM_API_KEY = "k";
    process.env.LLM_DEBUG_PROMPTS = "1";
    process.env.LLM_DEBUG_PROMPTS_DIR = dir;
    const sent: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(init);
      return respond();
    });
    const provider = getLlmProvider(models);
    const result = await provider.generateJson(request);
    vi.unstubAllGlobals();
    const files = readdirSync(dir).sort();
    return { result, sent, files };
  }

  const ok = () =>
    new Response(
      JSON.stringify({
        id: "gen-1",
        model: "served/model",
        choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      }),
      { status: 200 },
    );

  it("writes the request byte-for-byte as it went on the wire", async () => {
    const { sent, files } = await callWith(ok);
    const written = readFileSync(path.join(dir, files[0]!), "utf8");
    // Not "equivalent JSON" — identical. A dump that re-serializes is a second
    // rendering of the truth, close enough to trust and different enough to
    // mislead about the one thing you opened the file to check.
    expect(written).toBe(sent[0]!.body);
    expect(files[0]).toMatch(/\.request\.json$/);
  });

  it("keeps the prompts readable inside that body", async () => {
    await callWith(ok);
    const written = readdirSync(dir).find((f) => f.endsWith(".request.json"))!;
    const body = JSON.parse(readFileSync(path.join(dir, written), "utf8"));
    expect(body.messages[0].content).toBe(request.system);
    expect(body.messages[1].content).toBe(request.user);
  });

  it("writes the provider's own answer bytes, unparsed", async () => {
    const { files } = await callWith(ok);
    const response = files.find((f) => f.endsWith(".response.json"))!;
    expect(JSON.parse(readFileSync(path.join(dir, response), "utf8")).model).toBe(
      "served/model",
    );
  });

  it("records the untruncated error body when the provider rejects the call", async () => {
    const long = "campo inválido: " + "x".repeat(2000);
    const { result, files } = await callWith(
      () => new Response(long, { status: 400 }),
    );
    expect(result.ok).toBe(false);
    const response = files.find((f) => f.endsWith(".response.json"))!;
    // The log line caps at 500 chars; the file must not, since the part that
    // names the offending field is routinely past that.
    expect(readFileSync(path.join(dir, response), "utf8")).toBe(long);
  });

  it("writes nothing at all when the flag is off", async () => {
    rmSync(dir, { recursive: true, force: true });
    process.env.LLM_API_KEY = "k";
    process.env.LLM_DEBUG_PROMPTS_DIR = dir;
    vi.stubGlobal("fetch", async () => ok());
    await getLlmProvider(models).generateJson(request);
    vi.unstubAllGlobals();
    expect(existsSync(dir)).toBe(false);
  });
});
