import { describe, expect, it } from "vitest";

import {
  aiDietGenerateSchema,
  aiWorkoutGenerateSchema,
  cacheHitRatio,
  formatAiUsage,
  formatCacheHitRatio,
} from "@/lib/ai-programs";
import { resolveAiGenerations } from "@/lib/plans";
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

describe("aiWorkoutGenerateSchema", () => {
  const valid = {
    objective: "hipertrofia",
    equipment: ["academia" as const],
    daysPerWeek: 4,
  };

  it("accepts the treino form", () => {
    expect(aiWorkoutGenerateSchema.safeParse(valid).success).toBe(true);
  });

  it("requires at least one equipment option", () => {
    expect(
      aiWorkoutGenerateSchema.safeParse({ ...valid, equipment: [] }).success,
    ).toBe(false);
  });

  it("rejects 0 and 8 days per week", () => {
    expect(
      aiWorkoutGenerateSchema.safeParse({ ...valid, daysPerWeek: 0 }).success,
    ).toBe(false);
    expect(
      aiWorkoutGenerateSchema.safeParse({ ...valid, daysPerWeek: 8 }).success,
    ).toBe(false);
  });

  it("rejects an unknown equipment value", () => {
    expect(
      aiWorkoutGenerateSchema.safeParse({ ...valid, equipment: ["esteira"] })
        .success,
    ).toBe(false);
  });

  // The two forms are separate precisely so neither accepts the other's
  // answers: a treino that took `restrictions` would feed the prompt a
  // constraint its rules never mention.
  it("ignores diet-only answers rather than carrying them into the prompt", () => {
    const parsed = aiWorkoutGenerateSchema.safeParse({
      ...valid,
      restrictions: ["vegano"],
      mealsPerDay: 5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("restrictions");
      expect(parsed.data).not.toHaveProperty("mealsPerDay");
    }
  });
});

describe("aiDietGenerateSchema", () => {
  const valid = {
    objective: "emagrecimento",
    restrictions: [],
    mealsPerDay: 5,
  };

  it("accepts an empty restrictions array — 'none' is a real answer", () => {
    expect(aiDietGenerateSchema.safeParse(valid).success).toBe(true);
  });

  // The bug this split fixes: a dieta could not be generated at all without
  // ticking gym equipment, because both forms shared one schema.
  it("does not require equipment", () => {
    expect(aiDietGenerateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects 1 and 9 meals per day", () => {
    expect(
      aiDietGenerateSchema.safeParse({ ...valid, mealsPerDay: 1 }).success,
    ).toBe(false);
    expect(
      aiDietGenerateSchema.safeParse({ ...valid, mealsPerDay: 9 }).success,
    ).toBe(false);
  });

  it("rejects an unknown restriction value", () => {
    expect(
      aiDietGenerateSchema.safeParse({ ...valid, restrictions: ["low_carb"] })
        .success,
    ).toBe(false);
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

describe("cacheHitRatio", () => {
  it("is the cached share of all input tokens", () => {
    expect(cacheHitRatio(1_000, 9_000)).toBeCloseTo(0.9);
  });

  it("is null when nothing was measured — not 0", () => {
    // 0 would render as "0%", which reads as "the cache is broken" on a screen
    // that has simply never seen a generation.
    expect(cacheHitRatio(0, 0)).toBeNull();
    expect(formatCacheHitRatio(cacheHitRatio(0, 0))).toBe("—");
  });

  it("is 0 when every input token was billed fresh", () => {
    expect(cacheHitRatio(16_000, 0)).toBe(0);
    expect(formatCacheHitRatio(0)).toBe("0%");
  });
});

describe("resolveAiGenerations", () => {
  const base = { override: null, rowPresent: true, rowValue: 10, effectivePlan: "solo" } as const;

  it("prefers a per-clinic override over the plan", () => {
    expect(resolveAiGenerations({ ...base, override: 3 })).toBe(3);
  });

  it("treats an override of 0 as a real cap, not as 'unset'", () => {
    expect(resolveAiGenerations({ ...base, override: 0 })).toBe(0);
  });

  it("reads a present row with a NULL value as unlimited", () => {
    expect(
      resolveAiGenerations({
        override: null,
        rowPresent: true,
        rowValue: null,
        effectivePlan: "enterprise",
      }),
    ).toBeNull();
  });

  it("falls back to the coded default when the row is missing", () => {
    // Not to unlimited: every generation is a paid model call, so a missing
    // plan_limit row must not hand out uncapped credits.
    expect(
      resolveAiGenerations({
        override: null,
        rowPresent: false,
        rowValue: null,
        effectivePlan: "free",
      }),
    ).toBe(1);
  });
});
