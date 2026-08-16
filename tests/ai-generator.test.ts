import { describe, expect, it } from "vitest";

import { aiGenerateSchema, formatAiUsage } from "@/lib/ai-programs";
import { costMicroUsdFor } from "@/lib/llm-provider";
import { resolveIndices, type CatalogBlock } from "@/server/ai/catalog";
import {
  dietIndices,
  dietPlanSchema,
  workoutIndices,
  workoutPlanSchema,
} from "@/server/ai/schemas";

/**
 * Unit tests for the pure parts of the generator. The catalog block's *content*
 * needs a database (see `ai-generator.integration.test.ts`); everything here is
 * the logic that decides whether a model's answer is usable.
 */

function block(ids: string[]): CatalogBlock {
  const byIndex = new Map<number, string>();
  ids.forEach((id, i) => byIndex.set(i + 1, id));
  return { text: ids.join("\n"), byIndex, hash: "test", size: ids.length };
}

describe("resolveIndices", () => {
  it("maps 1-based indices to ids", () => {
    const result = resolveIndices(block(["a", "b", "c"]), [1, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ids.get(1)).toBe("a");
      expect(result.ids.get(3)).toBe("c");
    }
  });

  it("reports every out-of-range index rather than the first", () => {
    // The repair prompt names them all, so a model fixing one at a time would
    // burn the single free retry without converging.
    const result = resolveIndices(block(["a", "b"]), [1, 7, 9]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.invalid).toEqual([7, 9]);
  });

  it("rejects index 0 — the catalog is 1-based", () => {
    const result = resolveIndices(block(["a"]), [0]);
    expect(result.ok).toBe(false);
  });

  it("rejects a negative index", () => {
    expect(resolveIndices(block(["a"]), [-1]).ok).toBe(false);
  });
});

describe("workoutPlanSchema", () => {
  const valid = {
    name: "Treino A/B",
    notes: null,
    sessions: [
      {
        name: "Ficha A",
        exercises: [
          { exercise: 3, sets: 4, reps: [12, 10, 8, 8], rest: 90, note: null },
        ],
      },
    ],
  };

  it("accepts a well-formed plan", () => {
    expect(workoutPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("collects every referenced index across sessions", () => {
    const parsed = workoutPlanSchema.parse({
      ...valid,
      sessions: [
        valid.sessions[0],
        {
          name: "Ficha B",
          exercises: [
            { exercise: 9, sets: 3, reps: [10], rest: 60, note: null },
            { exercise: 4, sets: 3, reps: [10], rest: 60, note: null },
          ],
        },
      ],
    });
    expect(workoutIndices(parsed)).toEqual([3, 9, 4]);
  });

  it("rejects zero sets", () => {
    const bad = structuredClone(valid);
    bad.sessions[0].exercises[0].sets = 0;
    expect(workoutPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty reps array", () => {
    const bad = structuredClone(valid);
    bad.sessions[0].exercises[0].reps = [];
    expect(workoutPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("allows zero rest (supersets are still a legal shape downstream)", () => {
    const ok = structuredClone(valid);
    ok.sessions[0].exercises[0].rest = 0;
    expect(workoutPlanSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a plan with no sessions", () => {
    expect(
      workoutPlanSchema.safeParse({ ...valid, sessions: [] }).success,
    ).toBe(false);
  });
});

describe("dietPlanSchema", () => {
  const valid = {
    name: "Plano 2000 kcal",
    notes: null,
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [{ food: 12, grams: 100 }],
      },
    ],
  };

  it("accepts a well-formed plan", () => {
    expect(dietPlanSchema.safeParse(valid).success).toBe(true);
  });

  it("collects every referenced index across meals", () => {
    const parsed = dietPlanSchema.parse({
      ...valid,
      meals: [
        valid.meals[0],
        { name: "Almoço", time: null, items: [{ food: 5, grams: 150 }] },
      ],
    });
    expect(dietIndices(parsed)).toEqual([12, 5]);
  });

  it("rejects a zero-gram item — the DAL enforces > 0 too", () => {
    const bad = structuredClone(valid);
    bad.meals[0].items[0].grams = 0;
    expect(dietPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("allows a null time (\"ao acordar\" is a free-text slot)", () => {
    const ok = {
      ...valid,
      meals: [{ ...valid.meals[0], time: null as string | null }],
    };
    expect(dietPlanSchema.safeParse(ok).success).toBe(true);
  });
});

describe("aiGenerateSchema", () => {
  const valid = {
    objective: "hipertrofia",
    equipment: ["academia" as const],
    restrictions: [],
    daysPerWeek: 4,
  };

  it("accepts an empty restrictions array — 'none' is a real answer", () => {
    expect(aiGenerateSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one equipment option", () => {
    expect(
      aiGenerateSchema.safeParse({ ...valid, equipment: [] }).success,
    ).toBe(false);
  });

  it("rejects 0 and 8 days per week", () => {
    expect(
      aiGenerateSchema.safeParse({ ...valid, daysPerWeek: 0 }).success,
    ).toBe(false);
    expect(
      aiGenerateSchema.safeParse({ ...valid, daysPerWeek: 8 }).success,
    ).toBe(false);
  });

  it("rejects an unknown equipment value", () => {
    expect(
      aiGenerateSchema.safeParse({ ...valid, equipment: ["esteira"] }).success,
    ).toBe(false);
  });
});

describe("costMicroUsdFor", () => {
  it("is null when no tariff is configured", () => {
    delete process.env.LLM_PRICE_INPUT_PER_MTOK;
    delete process.env.LLM_PRICE_OUTPUT_PER_MTOK;
    expect(
      costMicroUsdFor({
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 500,
      }),
    ).toBeNull();
  });

  it("prices input and output at their own rates", () => {
    process.env.LLM_PRICE_INPUT_PER_MTOK = "0.03";
    process.env.LLM_PRICE_OUTPUT_PER_MTOK = "0.13";
    delete process.env.LLM_PRICE_CACHED_INPUT_PER_MTOK;
    // 10k in @ $0.03/M = 300 µUSD; 3k out @ $0.13/M = 390 µUSD.
    expect(
      costMicroUsdFor({
        inputTokens: 10_000,
        cachedInputTokens: 0,
        outputTokens: 3_000,
      }),
    ).toBe(690);
  });

  it("bills cache hits at the cached rate when one is set", () => {
    process.env.LLM_PRICE_INPUT_PER_MTOK = "0.03";
    process.env.LLM_PRICE_OUTPUT_PER_MTOK = "0.13";
    process.env.LLM_PRICE_CACHED_INPUT_PER_MTOK = "0.003";
    // 9k cached @ $0.003/M = 27; 1k fresh @ $0.03/M = 30; 3k out = 390.
    expect(
      costMicroUsdFor({
        inputTokens: 1_000,
        cachedInputTokens: 9_000,
        outputTokens: 3_000,
      }),
    ).toBe(447);
  });

  it("falls back to the full input rate when no cached rate is set", () => {
    process.env.LLM_PRICE_INPUT_PER_MTOK = "0.03";
    process.env.LLM_PRICE_OUTPUT_PER_MTOK = "0.13";
    delete process.env.LLM_PRICE_CACHED_INPUT_PER_MTOK;
    // Over-stating is the safe direction for an unknown discount:
    // 1k fresh + 9k cached, both at $0.03/M = 10k × 30 µUSD/1k = 300.
    expect(
      costMicroUsdFor({
        inputTokens: 1_000,
        cachedInputTokens: 9_000,
        outputTokens: 0,
      }),
    ).toBe(300);
  });
});

describe("formatAiUsage", () => {
  it("is singular at one", () => {
    expect(formatAiUsage(1, 10)).toBe("1 de 10 geração usada este mês");
  });

  it("omits the cap when unlimited", () => {
    expect(formatAiUsage(4, null)).toBe("4 gerações usadas este mês");
  });
});
