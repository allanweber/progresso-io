import { describe, expect, it } from "vitest";

import { assignGroupIds } from "@/lib/workout-grouping";
import type { WorkoutTechnique } from "@/lib/workout-techniques";

/** Deterministic id generator for stable assertions. */
function counter() {
  let n = 0;
  return () => `g${++n}`;
}

const ex = (technique: WorkoutTechnique | null) => ({ technique });
const ids = (t: (WorkoutTechnique | null)[]) =>
  assignGroupIds(t.map(ex), counter()).map((o) => o.groupId);

describe("assignGroupIds (super-set / giant-set chaining)", () => {
  it("chains a super set forward: marking only the first pairs it with the next", () => {
    // The coach marks exercise 1 as super set; exercise 2 is plain.
    expect(ids(["superset", null])).toEqual(["g1", "g1"]);
  });

  it("extends a giant set while consecutive items carry the same technique", () => {
    // Marking the first two giant-set items forms a block of three (incl. tail).
    expect(ids(["giant", "giant", null])).toEqual(["g1", "g1", "g1"]);
  });

  it("drops a lone marked item at the end (nothing to chain into)", () => {
    expect(ids([null, "superset"])).toEqual([null, null]);
  });

  it("keeps two separate blocks apart", () => {
    expect(ids(["superset", null, "superset", null])).toEqual([
      "g1",
      "g1",
      "g2",
      "g2",
    ]);
  });

  it("does not group non-grouping techniques (drop set stays standalone)", () => {
    expect(ids(["dropset", null, "cluster"])).toEqual([null, null, null]);
  });

  it("closes a block when the next grouping technique differs", () => {
    // superset chains into the giant item, which becomes the block's tail (a
    // different technique doesn't extend the chain); the trailing plain item is
    // then standalone.
    expect(ids(["superset", "giant", null])).toEqual(["g1", "g1", null]);
  });
});
