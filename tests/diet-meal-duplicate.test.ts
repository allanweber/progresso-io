import { describe, expect, it } from "vitest";

import {
  duplicateMealDraft,
  type MealDraft,
} from "@/components/diets/diet-builder";
import { DIET_MEALS_MAX, MEAL_NAME_MAX } from "@/lib/diets";

/**
 * Duplicating a meal in the diet builder. The copy has to be a *deep* one: the
 * keys are @dnd-kit's sortable ids and React's list keys, so a shared key would
 * make dragging the copy move the original, and a shared object would let an
 * edit on one reach into the other.
 */

/** Deterministic keys so the assertions can name them. */
function counter() {
  let n = 0;
  return () => `k${++n}`;
}

const macro = { energyKcal: 100, protein: 10, carbohydrate: 5, fat: 2 };

function meal(key: string, name: string): MealDraft {
  return {
    key,
    name,
    time: "12:00",
    items: [
      {
        key: `${key}-i1`,
        foodId: "food-1",
        description: "Arroz branco cozido",
        grams: 120,
        measureLabel: "escumadeira",
        measureGrams: 60,
        per100: { ...macro },
        substitutes: [
          {
            key: `${key}-s1`,
            foodId: "food-2",
            description: "Batata doce cozida",
            grams: 150,
            measureLabel: "fatia",
            measureGrams: 75,
            per100: { ...macro },
          },
        ],
      },
    ],
  };
}

describe("duplicateMealDraft", () => {
  it("drops the copy directly below the meal it came from", () => {
    const meals = [meal("a", "Café"), meal("b", "Almoço"), meal("c", "Jantar")];
    const next = duplicateMealDraft(meals, "b", counter());

    expect(next.map((m) => m.name)).toEqual([
      "Café",
      "Almoço",
      "Almoço (cópia)",
      "Jantar",
    ]);
    // The originals are untouched, by identity.
    expect(next[0]).toBe(meals[0]);
    expect(next[1]).toBe(meals[1]);
    expect(next[3]).toBe(meals[2]);
  });

  it("carries every food, quantity, medida and substitution across", () => {
    const meals = [meal("a", "Almoço")];
    const [, copy] = duplicateMealDraft(meals, "a", counter());

    expect(copy.time).toBe("12:00");
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]).toMatchObject({
      foodId: "food-1",
      grams: 120,
      measureLabel: "escumadeira",
      measureGrams: 60,
    });
    expect(copy.items[0].substitutes[0]).toMatchObject({
      foodId: "food-2",
      grams: 150,
      measureLabel: "fatia",
    });
  });

  it("regenerates every key, top to bottom", () => {
    const meals = [meal("a", "Almoço")];
    const [original, copy] = duplicateMealDraft(meals, "a", counter());

    expect(copy.key).toBe("k1");
    expect(copy.items[0].key).toBe("k2");
    expect(copy.items[0].substitutes[0].key).toBe("k3");
    // Nothing is shared with the original — not a key, not an object.
    expect(copy.key).not.toBe(original.key);
    expect(copy.items[0].key).not.toBe(original.items[0].key);
    expect(copy.items[0].per100).not.toBe(original.items[0].per100);
    expect(copy.items[0].substitutes).not.toBe(original.items[0].substitutes);
  });

  it("keeps the copy's name inside the limit the save enforces", () => {
    const long = "M".repeat(MEAL_NAME_MAX);
    const [, copy] = duplicateMealDraft([meal("a", long)], "a", counter());
    expect(copy.name.length).toBeLessThanOrEqual(MEAL_NAME_MAX);
    expect(copy.name.endsWith(" (cópia)")).toBe(true);
  });

  it("copies an unnamed meal as unnamed, not as ' (cópia)'", () => {
    const [, copy] = duplicateMealDraft([meal("a", "")], "a", counter());
    expect(copy.name).toBe("");
  });

  it("refuses past the meal cap, and ignores an unknown meal", () => {
    const full = Array.from({ length: DIET_MEALS_MAX }, (_, i) =>
      meal(`m${i}`, `Refeição ${i}`),
    );
    expect(duplicateMealDraft(full, "m0", counter())).toBe(full);

    const meals = [meal("a", "Almoço")];
    expect(duplicateMealDraft(meals, "nope", counter())).toBe(meals);
  });
});
