import { describe, expect, it } from "vitest";

import {
  AI_EQUIPMENT_LABELS,
  AI_EQUIPMENT_VALUES,
  aiDietGenerateSchema,
  aiWorkoutGenerateSchema,
  cacheHitRatio,
  formatAiUsage,
  formatCacheHitRatio,
} from "@/lib/ai-programs";
import { resolveAiGenerations } from "@/lib/plans";
import { resolveIndices, type CatalogBlock } from "@/server/ai/catalog";
import { dietSystemPrompt, workoutSystemPrompt } from "@/server/ai/prompts";
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

  it("offers only equipment the base catalog can actually fill", () => {
    // An option the catalog can't back produces a program the model has to
    // improvise, which the index check then rejects — a spent credit and no
    // draft. `elasticos` was one: too few `bands` rows to build a week from,
    // and the catalog calls them "Faixas elásticas" anyway.
    expect(AI_EQUIPMENT_VALUES).toEqual([
      "academia",
      "halteres",
      "peso_corporal",
    ]);
    expect(
      aiWorkoutGenerateSchema.safeParse({ ...valid, equipment: ["elasticos"] })
        .success,
    ).toBe(false);
    // Every offered value must have a label — an unlabelled one renders blank.
    for (const value of AI_EQUIPMENT_VALUES) {
      expect(AI_EQUIPMENT_LABELS[value]).toBeTruthy();
    }
  });

  // The two forms are separate precisely so neither accepts the other's
  // answers: a treino that took `restrictions` would feed the prompt a
  // constraint its rules never mention.
  it("ignores diet-only answers rather than carrying them into the prompt", () => {
    const parsed = aiWorkoutGenerateSchema.safeParse({
      ...valid,
      restrictions: ["vegano"],
      meals: ["almoco", "jantar"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("restrictions");
      expect(parsed.data).not.toHaveProperty("meals");
    }
  });
});

describe("aiDietGenerateSchema", () => {
  const valid = {
    objective: "emagrecimento",
    restrictions: [],
    meals: ["cafe_da_manha", "almoco", "jantar"],
    preferences: "",
    avoid: "",
  };

  it("accepts an empty restrictions array — 'none' is a real answer", () => {
    expect(aiDietGenerateSchema.safeParse(valid).success).toBe(true);
  });

  // The bug this split fixes: a dieta could not be generated at all without
  // ticking gym equipment, because both forms shared one schema.
  it("does not require equipment", () => {
    expect(aiDietGenerateSchema.safeParse(valid).success).toBe(true);
  });

  it("needs at least two meals — a one-meal day is not a plan", () => {
    expect(
      aiDietGenerateSchema.safeParse({ ...valid, meals: ["almoco"] }).success,
    ).toBe(false);
  });

  it("rejects an unknown meal slot", () => {
    // Slots are an enum, not free text, because each one carries a *kind* the
    // prompt uses to keep arroz-e-feijão out of the café da manhã.
    expect(
      aiDietGenerateSchema.safeParse({ ...valid, meals: ["brunch"] }).success,
    ).toBe(false);
  });

  it("keeps the coach's chosen order — chronology is theirs to decide", () => {
    const parsed = aiDietGenerateSchema.parse({
      ...valid,
      meals: ["almoco", "cafe_da_manha", "ceia"],
    });
    expect(parsed.meals).toEqual(["almoco", "cafe_da_manha", "ceia"]);
  });

  it("normalises blank preferences/avoid to null, not empty strings", () => {
    // The prompt skips the line when null; an empty label would invite the
    // model to fill it in with something nobody asked for.
    const parsed = aiDietGenerateSchema.parse(valid);
    expect(parsed.preferences).toBeNull();
    expect(parsed.avoid).toBeNull();
  });

  it("keeps preferences and avoid as separate answers", () => {
    // `restrictions` is four coded diets; `avoid` is "não come peixe". A form
    // that only had the checkboxes could not express the second at all.
    const parsed = aiDietGenerateSchema.parse({
      ...valid,
      preferences: "  ovo, banana  ",
      avoid: "jiló",
    });
    expect(parsed.preferences).toBe("ovo, banana");
    expect(parsed.avoid).toBe("jiló");
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

describe("system prompts", () => {
  const catalog = block(["a", "b"]);

  it("state the response schema in the prompt, not only in response_format", () => {
    // `response_format: json_schema` is honoured only by hosts that implement
    // strict structured outputs, and the cheap ones do not. On those the schema
    // is silently dropped and the model is told to "reply with the JSON in the
    // requested format" having never been shown the format — which produced a
    // runaway answer that burned the whole max_tokens ceiling and returned
    // nothing. The contract has to survive that host.
    for (const prompt of [
      workoutSystemPrompt(catalog),
      dietSystemPrompt(catalog),
    ]) {
      expect(prompt).toContain("JSON Schema");
      expect(prompt).toContain('"additionalProperties":false');
    }
    expect(workoutSystemPrompt(catalog)).toContain('"sessions"');
    expect(dietSystemPrompt(catalog)).toContain('"meals"');
  });

  it("keep the catalog last, after the schema", () => {
    // The catalog is the bulk of the cacheable prefix; anything appended after
    // it would push a second variable-length block into the cached span.
    const prompt = workoutSystemPrompt(catalog);
    expect(prompt.indexOf("JSON Schema")).toBeLessThan(
      prompt.indexOf(catalog.text),
    );
    expect(prompt.endsWith(catalog.text)).toBe(true);
  });

  it("are byte-identical across calls — the prompt cache depends on it", () => {
    // JSON.stringify over the schema is only safe because the schemas are
    // `as const` literals with fixed key order.
    expect(workoutSystemPrompt(catalog)).toBe(workoutSystemPrompt(catalog));
    expect(dietSystemPrompt(catalog)).toBe(dietSystemPrompt(catalog));
  });
});
