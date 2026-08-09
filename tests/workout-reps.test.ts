import { describe, expect, it } from "vitest";

import { formatReps, normalizeReps } from "@/lib/workouts";

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
});
