import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAiMemory,
  readAiDietMemory,
  readAiWorkoutMemory,
  writeAiMemory,
  type AiDietMemory,
  type AiWorkoutMemory,
} from "@/lib/ai-generate-memory";

/**
 * The remembered "Gerar com IA" answers.
 *
 * The value of this module is entirely in what it does with a record it should
 * NOT trust: one written by an older build, or half-corrupted. A blank dialog is
 * a minor annoyance, but a *wrongly restored* one is a diet generated against
 * restrictions the coach did not tick — so the rule under test throughout is
 * "keep every answer this build still understands, silently drop the rest".
 */

const ALUNO = "student-1";
const OUTRO = "student-2";

const workout: AiWorkoutMemory = {
  objective: "hipertrofia",
  equipment: ["academia", "halteres"],
  daysPerWeek: 5,
};

const diet: AiDietMemory = {
  objective: "emagrecimento",
  restrictions: ["sem_lactose"],
  meals: ["cafe_da_manha", "almoco", "jantar"],
  mealsPerDayRaw: "5",
  macroProfiles: ["alta_proteina", "baixo_carbo"],
  preferences: "ovo, tapioca",
  avoid: "jiló",
  targetKcal: "2600",
  targetProteinG: "180",
  targetCarbsG: "",
  targetFatG: "70",
};

/** The key one aluno's answers live under, for tests that plant a raw record. */
const key = (kind: "workout" | "diet", id: string) =>
  `ai-generate:v1:${kind}:${id}`;

describe("ai generate memory", () => {
  beforeEach(() => localStorage.clear());

  it("restores a treino exactly as it was asked for", () => {
    writeAiMemory("workout", ALUNO, workout);
    expect(readAiWorkoutMemory(ALUNO)).toEqual(workout);
  });

  it("restores a dieta exactly as it was asked for, blank boxes included", () => {
    writeAiMemory("diet", ALUNO, diet);
    // `targetCarbsG: ""` must survive as "": restoring it as a number would put
    // a target on screen the coach never typed.
    expect(readAiDietMemory(ALUNO)).toEqual(diet);
  });

  it("keeps each aluno's answers apart", () => {
    writeAiMemory("workout", ALUNO, workout);
    expect(readAiWorkoutMemory(OUTRO)).toBeNull();
  });

  it("keeps treino and dieta apart for the same aluno", () => {
    writeAiMemory("diet", ALUNO, diet);
    expect(readAiWorkoutMemory(ALUNO)).toBeNull();
  });

  it("answers null when nothing was ever generated", () => {
    expect(readAiWorkoutMemory(ALUNO)).toBeNull();
    expect(readAiDietMemory(ALUNO)).toBeNull();
  });

  it("never persists fromScratch, even if something plants it", () => {
    writeAiMemory("diet", ALUNO, diet);
    expect(localStorage.getItem(key("diet", ALUNO))).not.toContain("fromScratch");
    // And a record that carries one does not smuggle it back into the form.
    localStorage.setItem(
      key("diet", ALUNO),
      JSON.stringify({ ...diet, fromScratch: true }),
    );
    expect(readAiDietMemory(ALUNO)).not.toHaveProperty("fromScratch");
  });

  it("drops options this build no longer knows and keeps the rest", () => {
    localStorage.setItem(
      key("workout", ALUNO),
      JSON.stringify({ ...workout, equipment: ["academia", "elasticos"] }),
    );
    expect(readAiWorkoutMemory(ALUNO)?.equipment).toEqual(["academia"]);
  });

  it("falls back per field rather than discarding the whole record", () => {
    localStorage.setItem(
      key("workout", ALUNO),
      JSON.stringify({ ...workout, daysPerWeek: "muitos" }),
    );
    const saved = readAiWorkoutMemory(ALUNO);
    // The objective and equipment are still the coach's; only the broken field
    // reverts to the dialog's default.
    expect(saved).toEqual({ ...workout, daysPerWeek: 3 });
  });

  it("refuses an out-of-range number", () => {
    localStorage.setItem(
      key("workout", ALUNO),
      JSON.stringify({ ...workout, daysPerWeek: 99 }),
    );
    expect(readAiWorkoutMemory(ALUNO)?.daysPerWeek).toBe(3);
  });

  it("answers null for a corrupt record instead of throwing", () => {
    localStorage.setItem(key("diet", ALUNO), "{not json");
    expect(readAiDietMemory(ALUNO)).toBeNull();
  });

  it("ignores a record written by a previous version", () => {
    localStorage.setItem(`ai-generate:v0:diet:${ALUNO}`, JSON.stringify(diet));
    expect(readAiDietMemory(ALUNO)).toBeNull();
  });

  it("wipes every aluno's answers on sign-out, and nothing else", () => {
    writeAiMemory("workout", ALUNO, workout);
    writeAiMemory("diet", ALUNO, diet);
    writeAiMemory("diet", OUTRO, diet);
    localStorage.setItem("cookie-consent", "accepted");

    clearAiMemory();

    expect(readAiWorkoutMemory(ALUNO)).toBeNull();
    expect(readAiDietMemory(ALUNO)).toBeNull();
    expect(readAiDietMemory(OUTRO)).toBeNull();
    expect(localStorage.getItem("cookie-consent")).toBe("accepted");
  });
});
