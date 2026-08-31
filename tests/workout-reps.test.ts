import { describe, expect, it } from "vitest";

import { formatReps, normalizeReps, resolveSets } from "@/lib/workouts";

describe("normalizeReps (backward compatibility)", () => {
  it("passes through the current shapes unchanged", () => {
    expect(normalizeReps({ kind: "fixed", value: 12 })).toEqual({
      kind: "fixed",
      value: 12,
    });
    expect(normalizeReps({ kind: "range", values: [10, 8, 6, 4] })).toEqual({
      kind: "range",
      values: [10, 8, 6, 4],
    });
    expect(normalizeReps({ kind: "failure" })).toEqual({ kind: "failure" });
    expect(normalizeReps({ kind: "pyramid", values: [12, 10, 8, 6] })).toEqual({
      kind: "pyramid",
      values: [12, 10, 8, 6],
    });
    expect(normalizeReps({ kind: "duration", seconds: 45 })).toEqual({
      kind: "duration",
      seconds: 45,
    });
  });

  it("formats a pyramid as its rep sequence", () => {
    expect(formatReps({ kind: "pyramid", values: [12, 10, 8, 6] })).toBe(
      "12-10-8-6",
    );
  });

  it("upgrades the legacy range shape { min, max } to a sequence", () => {
    // Workouts saved before reps became a sequence.
    expect(normalizeReps({ kind: "range", min: 8, max: 12 })).toEqual({
      kind: "range",
      values: [8, 12],
    });
  });

  it("degrades unrecognisable data to Falha instead of throwing", () => {
    expect(normalizeReps(null)).toEqual({ kind: "failure" });
    expect(normalizeReps({ kind: "range" })).toEqual({ kind: "failure" });
    expect(normalizeReps({})).toEqual({ kind: "failure" });
  });

  it("formatReps renders a legacy range without crashing", () => {
    // The bug: a stored { kind:"range", min, max } crashed the detail render.
    expect(formatReps({ kind: "range", min: 8, max: 10 } as never)).toBe("8-10");
  });

  it("formats a duration in seconds, minutes or mm:ss", () => {
    expect(formatReps({ kind: "duration", seconds: 45 })).toBe("45s");
    expect(formatReps({ kind: "duration", seconds: 120 })).toBe("2min");
    expect(formatReps({ kind: "duration", seconds: 90 })).toBe("1:30");
  });
});

describe("resolveSets (pirâmide invariant)", () => {
  it("derives the set count from the pyramid's positions", () => {
    expect(resolveSets({ kind: "pyramid", values: [12, 10, 8, 6] }, 3)).toBe(4);
    // Removing a position drops a série; adding one adds a série.
    expect(resolveSets({ kind: "pyramid", values: [12, 10, 8] }, 4)).toBe(3);
    expect(resolveSets({ kind: "pyramid", values: [12, 10, 8, 6, 4] }, 4)).toBe(5);
  });

  it("leaves every other kind's sets to the coach", () => {
    expect(resolveSets({ kind: "range", values: [8, 12] }, 3)).toBe(3);
    expect(resolveSets({ kind: "duration", seconds: 30 }, 5)).toBe(5);
    expect(resolveSets({ kind: "failure" }, 2)).toBe(2);
  });
});
