import { describe, expect, it } from "vitest";

import {
  formatTrialDaysLeft,
  TRIAL_DAYS,
  TRIAL_PLAN,
  trialDaysLeft,
  trialEndsAtFrom,
} from "@/lib/plans";

/** Pure trial helpers — the date maths behind the countdown banner. */

const at = (iso: string) => new Date(iso);

describe("trialEndsAtFrom", () => {
  it("lands TRIAL_DAYS after the start", () => {
    const end = trialEndsAtFrom(at("2026-08-16T10:00:00.000Z"));
    expect(end.toISOString()).toBe("2026-08-30T10:00:00.000Z");
    expect(TRIAL_DAYS).toBe(14);
  });

  it("crosses a month boundary correctly", () => {
    expect(trialEndsAtFrom(at("2026-01-25T00:00:00.000Z")).toISOString()).toBe(
      "2026-02-08T00:00:00.000Z",
    );
  });

  it("does not mutate the date it was given", () => {
    const start = at("2026-08-16T10:00:00.000Z");
    trialEndsAtFrom(start);
    expect(start.toISOString()).toBe("2026-08-16T10:00:00.000Z");
  });
});

describe("trialDaysLeft", () => {
  it("counts whole days remaining", () => {
    expect(
      trialDaysLeft(at("2026-08-30T10:00:00.000Z"), at("2026-08-16T10:00:00.000Z")),
    ).toBe(14);
  });

  it("rounds UP a partial day, so a trial ending tonight still reads 1", () => {
    // 6 hours left must never render as "0 dias restantes" while it is live.
    expect(
      trialDaysLeft(at("2026-08-16T16:00:00.000Z"), at("2026-08-16T10:00:00.000Z")),
    ).toBe(1);
  });

  it("is 0 exactly at the deadline and after it", () => {
    const deadline = at("2026-08-30T10:00:00.000Z");
    expect(trialDaysLeft(deadline, deadline)).toBe(0);
    expect(trialDaysLeft(deadline, at("2026-09-05T10:00:00.000Z"))).toBe(0);
  });
});

describe("formatTrialDaysLeft", () => {
  it("uses the singular for exactly one day", () => {
    expect(formatTrialDaysLeft(1)).toBe("1 dia restante");
  });

  it("uses the plural otherwise", () => {
    expect(formatTrialDaysLeft(14)).toBe("14 dias restantes");
    expect(formatTrialDaysLeft(0)).toBe("0 dias restantes");
  });
});

describe("TRIAL_PLAN", () => {
  it("is Solo — the conversion target, not the top tier", () => {
    expect(TRIAL_PLAN).toBe("solo");
  });
});
