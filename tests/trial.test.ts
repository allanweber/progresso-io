import { describe, expect, it } from "vitest";

import {
  formatTrialDaysLeft,
  TRIAL_DAYS,
  TRIAL_PLAN,
  effectivePlanOf,
  trialPlanFor,
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

describe("trialPlanFor", () => {
  it("trials Clínica for a coach who picked Clínica", () => {
    // Otherwise the two features that plan is bought for — a shared team and a
    // branded portal — are invisible for the whole 14 days, including in the
    // setup guide that offers to configure them.
    expect(trialPlanFor("clinica")).toBe("clinica");
  });

  it("trials Solo for every other pick, and for no pick at all", () => {
    expect(trialPlanFor("solo")).toBe("solo");
    expect(trialPlanFor("free")).toBe("solo");
    expect(trialPlanFor(null)).toBe("solo");
    // Enterprise is not self-selectable at sign-up; if one ever lands here it
    // must not hand out Enterprise limits.
    expect(trialPlanFor("enterprise")).toBe("solo");
  });
});

describe("effectivePlanOf", () => {
  const now = new Date("2026-03-01T12:00:00Z");
  const future = new Date("2026-03-10T12:00:00Z");
  const past = new Date("2026-02-20T12:00:00Z");

  it("grants the picked plan while the trial runs", () => {
    expect(
      effectivePlanOf(
        { plan: "free", intendedPlan: "clinica", trialEndsAt: future },
        now,
      ),
    ).toBe("clinica");
  });

  it("falls back to the stored plan once the trial is spent", () => {
    expect(
      effectivePlanOf(
        { plan: "free", intendedPlan: "clinica", trialEndsAt: past },
        now,
      ),
    ).toBe("free");
  });

  it("ignores the trial for a clinic that actually pays", () => {
    // A trial only applies while the plan is still free, so a paying clinic's
    // leftover deadline can never downgrade OR upgrade it.
    expect(
      effectivePlanOf(
        { plan: "solo", intendedPlan: "clinica", trialEndsAt: future },
        now,
      ),
    ).toBe("solo");
  });
});
