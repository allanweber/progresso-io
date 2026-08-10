import { describe, expect, it } from "vitest";

import {
  validateAnswer,
  validateAnswers,
  type AnamnesisQuestion,
  type AnamnesisSection,
} from "@/lib/anamneses";

/** Small helper to build a masked question. */
function q(
  mask: AnamnesisQuestion["mask"],
  extra: Partial<AnamnesisQuestion> = {},
): AnamnesisQuestion {
  return { key: "x", type: "short_text", label: "X", mask, ...extra };
}

describe("validateAnswer", () => {
  it("passes empty/absent values (answers are optional)", () => {
    expect(validateAnswer(q("date"), "")).toBeNull();
    expect(validateAnswer(q("integer"), null)).toBeNull();
    expect(validateAnswer(q("decimal"), undefined)).toBeNull();
  });

  it("ignores unmasked and non-string answers", () => {
    expect(validateAnswer(q(undefined), "qualquer coisa")).toBeNull();
    expect(validateAnswer(q("integer"), true)).toBeNull();
  });

  describe("date (dd/mm/aaaa)", () => {
    it("accepts a real past date", () => {
      expect(validateAnswer(q("date"), "10/05/1996")).toBeNull();
    });
    it("rejects a malformed or impossible date", () => {
      expect(validateAnswer(q("date"), "1996-05-10")).toMatch(/dd\/mm\/aaaa/);
      expect(validateAnswer(q("date"), "31/02/2020")).toBe("Data inexistente.");
    });
    it("rejects a future date", () => {
      expect(validateAnswer(q("date"), "31/12/2999")).toMatch(/futuro/);
    });
  });

  describe("integer", () => {
    const idade = q("integer", { min: 0, max: 120 });
    it("accepts an in-range whole number", () => {
      expect(validateAnswer(idade, "29")).toBeNull();
    });
    it("rejects non-digits and out-of-range values", () => {
      expect(validateAnswer(idade, "29,5")).toMatch(/inteiro/);
      expect(validateAnswer(idade, "999")).toMatch(/máximo/);
      expect(validateAnswer(q("integer", { min: 1 }), "0")).toMatch(/mínimo/);
    });
  });

  describe("decimal", () => {
    const peso = q("decimal", { min: 20, max: 400 });
    it("accepts an integer or one comma-decimal", () => {
      expect(validateAnswer(peso, "71")).toBeNull();
      expect(validateAnswer(peso, "71,4")).toBeNull();
    });
    it("rejects a dot-decimal or out-of-range value", () => {
      expect(validateAnswer(peso, "71.4")).toMatch(/número/);
      expect(validateAnswer(peso, "10")).toMatch(/mínimo/);
    });
  });

  describe("pressure", () => {
    it("accepts nnn/nn (2–3 digits each) and rejects the rest", () => {
      expect(validateAnswer(q("pressure"), "120/80")).toBeNull();
      expect(validateAnswer(q("pressure"), "90/60")).toBeNull();
      expect(validateAnswer(q("pressure"), "12/8")).toMatch(/120\/80/);
      expect(validateAnswer(q("pressure"), "120")).toMatch(/120\/80/);
    });
  });
});

describe("validateAnswers", () => {
  const sections: AnamnesisSection[] = [
    {
      key: "s",
      title: "S",
      questions: [
        { key: "nasc", type: "short_text", label: "Nasc", mask: "date" },
        { key: "peso", type: "short_text", label: "Peso", mask: "decimal", min: 20, max: 400 },
        { key: "obs", type: "long_text", label: "Obs" },
      ],
    },
  ];

  it("collects one message per invalid masked answer", () => {
    const errors = validateAnswers(sections, {
      nasc: "99/99/9999",
      peso: "5",
      obs: "texto livre qualquer",
    });
    expect(Object.keys(errors).sort()).toEqual(["nasc", "peso"]);
  });

  it("returns no errors when everything is valid or empty", () => {
    expect(validateAnswers(sections, { nasc: "01/01/2000", peso: "", obs: "x" })).toEqual(
      {},
    );
  });
});
