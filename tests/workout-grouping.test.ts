import { describe, expect, it } from "vitest";

import { detachExercise, moveExercise, supersetGroupIds } from "@/lib/workout-grouping";

const counter = () => {
  let n = 0;
  return () => `g${++n}`;
};
const ids = (linked: boolean[]) =>
  supersetGroupIds(linked.map((l) => ({ linked: l })), counter());

describe("supersetGroupIds", () => {
  it("joins an exercise with the one above it", () => {
    expect(ids([false, true])).toEqual(["g1", "g1"]);
  });

  it("keeps a super set growing while each next exercise is linked", () => {
    expect(ids([false, true, true, true])).toEqual(["g1", "g1", "g1", "g1"]);
  });

  it("leaves unlinked exercises out of any block", () => {
    expect(ids([false, false, true, false])).toEqual([null, "g1", "g1", null]);
  });

  it("starts a new block after an unlinked exercise", () => {
    expect(ids([false, true, false, true])).toEqual(["g1", "g1", "g2", "g2"]);
  });

  it("ignores a link on the first exercise, which has nothing above it", () => {
    expect(ids([true, false])).toEqual([null, null]);
    expect(ids([true, true])).toEqual(["g1", "g1"]);
  });
});

const rows = (linked: boolean[]) => linked.map((l, i) => ({ key: String.fromCharCode(65 + i), linked: l }));
const shape = (list: { key: string; linked: boolean }[]) =>
  list.map((x) => (x.linked ? `+${x.key}` : x.key)).join(" ");

describe("detachExercise", () => {
  it("keeps the block together when a middle member leaves", () => {
    expect(shape(detachExercise(rows([false, true, true]), 1))).toBe("A +C");
  });

  it("starts the rest of the block fresh when its first member leaves", () => {
    expect(shape(detachExercise(rows([false, true, true]), 0))).toBe("B +C");
  });

  it("does not join the next exercise to the one above an unlinked exercise", () => {
    expect(shape(detachExercise(rows([false, false, true]), 1))).toBe("A C");
  });
});

describe("moveExercise", () => {
  it("takes a dragged exercise out of its super set", () => {
    expect(shape(moveExercise(rows([false, true, true, false]), 1, 3))).toBe("A +C D B");
  });
});
