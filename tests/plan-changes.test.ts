import { describe, expect, it } from "vitest";

import { dietChanged, workoutChanged } from "@/lib/plan-changes";
import type { WorkoutStructure } from "@/lib/student-workouts";
import type { DietStructure } from "@/lib/student-diets";

/**
 * The guard behind "publicar sem alterações não gera uma versão". The trap it
 * has to survive: the builder mints a NEW uuid for every super-set block on
 * every payload it builds, so an untouched workout is never byte-identical to
 * the one already stored.
 */
const item = (over: Partial<WorkoutStructure["sessions"][number]["items"][number]> = {}) => ({
  exerciseId: "11111111-1111-1111-1111-111111111111",
  sets: 3,
  reps: { kind: "range" as const, values: [8, 12] },
  load: null,
  rest: 90,
  note: null,
  technique: null,
  groupId: null,
  customSubstitutes: [],
  ...over,
});

const workout = (tree: WorkoutStructure) => ({
  name: "Hipertrofia",
  notes: null,
  cardio: null,
  tree,
});

describe("workoutChanged", () => {
  it("sees no change in an untouched tree", () => {
    const tree: WorkoutStructure = {
      sessions: [{ name: "Ficha A", items: [item()] }],
    };
    expect(workoutChanged(workout(tree), workout(structuredClone(tree)))).toBe(
      false,
    );
  });

  it("ignores the identity of groupIds, only the shape of the blocks", () => {
    const blocks = (a: string, b: string): WorkoutStructure => ({
      sessions: [
        {
          name: "Ficha A",
          items: [
            item({ technique: "superset", groupId: a }),
            item({ technique: null, groupId: a }),
            item({ technique: null, groupId: b }),
          ],
        },
      ],
    });
    // Same grouping, fresh uuids — the builder's every save looks like this.
    expect(
      workoutChanged(workout(blocks("uuid-1", "uuid-2")), workout(blocks("uuid-3", "uuid-4"))),
    ).toBe(false);

    // Genuinely different grouping: the third item joined the first block.
    const merged: WorkoutStructure = {
      sessions: [
        {
          name: "Ficha A",
          items: [
            item({ technique: "superset", groupId: "x" }),
            item({ technique: null, groupId: "x" }),
            item({ technique: null, groupId: "x" }),
          ],
        },
      ],
    };
    expect(workoutChanged(workout(blocks("a", "b")), workout(merged))).toBe(true);
  });

  it("ignores key order — jsonb returns a stored tree in its own", () => {
    const tree: WorkoutStructure = {
      sessions: [{ name: "Ficha A", items: [item({ load: "40 kg" })] }],
    };
    const reordered = JSON.parse(
      JSON.stringify(tree, ["sessions", "items", "customSubstitutes", "groupId", "technique", "note", "rest", "load", "reps", "kind", "values", "sets", "exerciseId", "name"]),
    ) as WorkoutStructure;
    expect(workoutChanged(workout(tree), workout(reordered))).toBe(false);
  });

  it("sees a changed prescription, name, notes or cardio", () => {
    const tree: WorkoutStructure = {
      sessions: [{ name: "Ficha A", items: [item()] }],
    };
    const heavier: WorkoutStructure = {
      sessions: [{ name: "Ficha A", items: [item({ sets: 4 })] }],
    };
    expect(workoutChanged(workout(tree), workout(heavier))).toBe(true);
    expect(
      workoutChanged(workout(tree), { ...workout(tree), name: "Cutting" }),
    ).toBe(true);
    expect(
      workoutChanged(workout(tree), { ...workout(tree), notes: "Beba água" }),
    ).toBe(true);
    expect(
      workoutChanged(workout(tree), { ...workout(tree), cardio: "20 min" }),
    ).toBe(true);
  });
});

describe("dietChanged", () => {
  const tree: DietStructure = {
    meals: [
      {
        name: "Café da manhã",
        time: "08:00",
        items: [
          {
            foodId: "22222222-2222-2222-2222-222222222222",
            grams: 100,
            measureLabel: null,
            measureGrams: null,
          },
        ],
      },
    ],
  };
  const diet = (t: DietStructure) => ({ name: "Cutting", notes: null, tree: t });

  it("sees no change in an untouched tree", () => {
    expect(dietChanged(diet(tree), diet(structuredClone(tree)))).toBe(false);
  });

  it("sees a changed portion or name", () => {
    const bigger = structuredClone(tree);
    bigger.meals[0].items[0].grams = 120;
    expect(dietChanged(diet(tree), diet(bigger))).toBe(true);
    expect(dietChanged(diet(tree), { ...diet(tree), name: "Bulking" })).toBe(true);
  });
});
