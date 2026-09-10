import { describe, expect, it } from "vitest";

import {
  bodyFatSourceLabel,
  defaultNoteBody,
  evaluationAcceptSchema,
  evaluationRequestSchema,
  normalizePayload,
  settleBodyFat,
  type AiEvaluationPayload,
} from "@/lib/ai-evaluation";
import { evaluationSchema } from "@/server/ai/schemas";

/**
 * The decisions the evaluation makes about its own numbers.
 *
 * The rule under test throughout: **calipers beat a photograph, a photograph
 * beats nothing, and nothing is an honest answer.** Everything else here exists
 * to stop a discarded guess from surviving next to the number the system kept.
 */

const ANSWER: AiEvaluationPayload = {
  bodyFatPct: 21.5,
  confidence: "media",
  unavailable: null,
  verdict: "ajustar",
  summary: "Perda de gordura consistente.",
  evolution: "Cintura caiu 2 cm.",
  diet: "Manter as calorias por duas semanas.",
  workout: "Mais uma série de costas.",
};

describe("settleBodyFat", () => {
  it("takes the caliper number and throws the model's guess away", () => {
    const settled = settleBodyFat(18.2, ANSWER);
    expect(settled.bodyFatPct).toBe(18.2);
    expect(settled.bodyFatSource).toBe("skinfolds");
    // Confidence describes how sure the model is of something it looked at, and
    // it did not produce this number.
    expect(settled.confidence).toBeNull();
  });

  it("uses the visual estimate when there is no caliper number", () => {
    const settled = settleBodyFat(null, ANSWER);
    expect(settled.bodyFatPct).toBe(21.5);
    expect(settled.bodyFatSource).toBe("estimate");
    expect(settled.confidence).toBe("media");
  });

  it("reads a missing confidence as low, not as high", () => {
    const settled = settleBodyFat(null, { ...ANSWER, confidence: null });
    expect(settled.confidence).toBe("baixa");
  });

  it("carries no number at all when neither exists", () => {
    const settled = settleBodyFat(null, { ...ANSWER, bodyFatPct: null });
    expect(settled).toEqual({
      bodyFatPct: null,
      bodyFatSource: null,
      confidence: null,
    });
  });
});

describe("normalizePayload", () => {
  it("clears a guess the server overrode, so the stored answer has one number", () => {
    // The model was told the folds already settled it. A model that answers
    // anyway must not leave a competing figure sitting inside the payload.
    const payload = normalizePayload(ANSWER, 18.2);
    expect(payload.bodyFatPct).toBeNull();
    expect(payload.confidence).toBeNull();
    expect(payload.unavailable).toBeNull();
    // The advice is untouched — that part IS the model's work.
    expect(payload.diet).toBe(ANSWER.diet);
    expect(payload.verdict).toBe("ajustar");
  });

  it("leaves the estimate intact when the server had nothing to compute", () => {
    expect(normalizePayload(ANSWER, null)).toEqual(ANSWER);
  });
});

describe("bodyFatSourceLabel", () => {
  it("never renders an estimate the way it renders a measurement", () => {
    expect(bodyFatSourceLabel("skinfolds", null)).toBe(
      "dobras cutâneas (7 dobras)",
    );
    expect(bodyFatSourceLabel("estimate", "baixa")).toBe(
      "estimativa visual (confiança baixa)",
    );
    expect(bodyFatSourceLabel("skinfolds", null)).not.toBe(
      bodyFatSourceLabel("estimate", "alta"),
    );
  });

  it("has nothing to say when there is no number", () => {
    expect(bodyFatSourceLabel(null, null)).toBeNull();
  });
});

describe("the model's contract", () => {
  it("accepts a refusal to estimate", () => {
    const parsed = evaluationSchema.safeParse({
      ...ANSWER,
      bodyFatPct: null,
      confidence: null,
      unavailable: "As fotos estão com roupa larga demais.",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty evolution — a first check-in has no comparison", () => {
    const parsed = evaluationSchema.safeParse({ ...ANSWER, evolution: "" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a body fat outside the range a human record can hold", () => {
    expect(evaluationSchema.safeParse({ ...ANSWER, bodyFatPct: 0 }).success).toBe(
      false,
    );
    expect(
      evaluationSchema.safeParse({ ...ANSWER, bodyFatPct: 90 }).success,
    ).toBe(false);
  });

  it("rejects a verdict outside the three the UI can render", () => {
    expect(
      evaluationSchema.safeParse({ ...ANSWER, verdict: "parabéns" }).success,
    ).toBe(false);
  });
});

describe("evaluationAcceptSchema", () => {
  it("takes a null percentage — accepting advice without a number is normal", () => {
    const parsed = evaluationAcceptSchema.safeParse({
      bodyFatPct: null,
      body: "Nota do coach.",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses an empty note — an empty note is not a note", () => {
    const parsed = evaluationAcceptSchema.safeParse({
      bodyFatPct: 20,
      body: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("catches a slipped decimal point", () => {
    expect(
      evaluationAcceptSchema.safeParse({ bodyFatPct: 205, body: "x" }).success,
    ).toBe(false);
    expect(
      evaluationAcceptSchema.safeParse({ bodyFatPct: 0.2, body: "x" }).success,
    ).toBe(false);
  });

  it("takes only the fat percentage — massa magra is its complement", () => {
    // Sending both would create a way to save 22% fat next to 82% lean.
    const parsed = evaluationAcceptSchema.parse({
      bodyFatPct: 22,
      body: "x",
      leanMassPct: 82,
    });
    expect("leanMassPct" in parsed).toBe(false);
  });
});

describe("evaluationRequestSchema", () => {
  it("treats a missing key the same as no steer for this run", () => {
    const parsed = evaluationRequestSchema.parse({});
    expect(parsed.instructions).toBeNull();
  });

  it("collapses a blank textarea to null rather than an empty instruction", () => {
    const parsed = evaluationRequestSchema.parse({ instructions: "   " });
    expect(parsed.instructions).toBeNull();
  });

  it("trims what the coach typed", () => {
    const parsed = evaluationRequestSchema.parse({
      instructions: "  Focar na cintura.  ",
    });
    expect(parsed.instructions).toBe("Focar na cintura.");
  });

  it("accepts an explicit null the same as blank", () => {
    const parsed = evaluationRequestSchema.parse({ instructions: null });
    expect(parsed.instructions).toBeNull();
  });

  it("rejects instructions the model would never fully read anyway", () => {
    const parsed = evaluationRequestSchema.safeParse({
      instructions: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("defaultNoteBody", () => {
  it("renders the model's blocks as the note the coach starts from", () => {
    const body = defaultNoteBody(ANSWER);
    expect(body).toContain("Perda de gordura consistente.");
    expect(body).toContain("Evolução: Cintura caiu 2 cm.");
    expect(body).toContain("Dieta: Manter as calorias por duas semanas.");
    expect(body).toContain("Treino: Mais uma série de costas.");
  });

  it("omits an empty evolution instead of labelling a blank", () => {
    const body = defaultNoteBody({ ...ANSWER, evolution: "" });
    expect(body).not.toContain("Evolução:");
  });
});
