import { describe, expect, it } from "vitest";

import {
  ageOnDate,
  bodyFatFromSkinfolds,
  derivedMasses,
  siriBodyFatPct,
  skinfoldSum,
  bodyDensity7Site,
} from "@/lib/body-composition";
import type { CheckinSkinfolds } from "@/lib/checkin-assessment";

/**
 * The arithmetic the server does instead of the model.
 *
 * These are the numbers a coach may write into a client's record, so the tests
 * are about the *refusals* as much as the results: an incomplete protocol, a
 * missing sex and an implausible answer must all come back `null` rather than
 * as a plausible-looking figure nobody can trace.
 */

/** A complete 7-site set summing to 100 mm, for arithmetic that is checkable. */
const SEVEN: CheckinSkinfolds = {
  tricipital: 10,
  subescapular: 15,
  peitoral: 12,
  axilar_media: 13,
  suprailiaca: 20,
  abdominal: 20,
  coxa: 10,
};

describe("ageOnDate", () => {
  it("counts whole years, not calendar-year differences", () => {
    // Birthday already passed this year.
    expect(ageOnDate("1990-03-14", "2026-09-09")).toBe(36);
    // Birthday still to come — the naive subtraction says 36.
    expect(ageOnDate("1990-12-14", "2026-09-09")).toBe(35);
    // On the birthday itself.
    expect(ageOnDate("1990-09-09", "2026-09-09")).toBe(36);
    // The day before.
    expect(ageOnDate("1990-09-10", "2026-09-09")).toBe(35);
  });

  it("is timezone-free — the string is the date", () => {
    // `new Date("1990-01-01")` is UTC midnight, which in São Paulo is the
    // evening of 1989-12-31. Comparing strings is what keeps this honest.
    expect(ageOnDate("1990-01-01", "2026-01-01")).toBe(36);
  });

  it("refuses ages the equation was never fitted for", () => {
    expect(ageOnDate("2020-01-01", "2026-01-01")).toBeNull(); // 6 years old
    expect(ageOnDate("1800-01-01", "2026-01-01")).toBeNull(); // 226
    expect(ageOnDate("not-a-date", "2026-01-01")).toBeNull();
  });
});

describe("skinfoldSum", () => {
  it("sums a complete set", () => {
    expect(skinfoldSum(SEVEN)).toBe(100);
  });

  it("is null when ANY site is missing — the protocol is all-or-nothing", () => {
    const { coxa: _coxa, ...six } = SEVEN;
    void _coxa;
    expect(skinfoldSum(six)).toBeNull();
  });

  it("treats a stored 0 as unmeasured, not as a fold of zero", () => {
    // Nobody has a 0 mm skinfold; a stored zero is a placeholder or a typo, and
    // folding it into the sum would silently understate the body fat.
    expect(skinfoldSum({ ...SEVEN, coxa: 0 })).toBeNull();
  });
});

describe("Jackson-Pollock 7-site → Siri", () => {
  it("is sex-specific — the same folds mean different densities", () => {
    const male = bodyDensity7Site(100, "masculino", 30);
    const female = bodyDensity7Site(100, "feminino", 30);
    expect(male).not.toBeCloseTo(female, 4);
    // Sanity: human body density sits either side of 1.0 g/cm³.
    expect(male).toBeGreaterThan(1.0);
    expect(male).toBeLessThan(1.12);
  });

  it("computes a plausible percentage for a complete male protocol", () => {
    const pct = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "masculino",
      birthDate: "1996-01-01",
      onDate: "2026-01-01",
    });
    // Σ100 mm at 30 is a lean-ish adult male; the exact figure is the
    // polynomial's, and the point of the assertion is the band it lands in.
    expect(pct).toBeGreaterThan(10);
    expect(pct).toBeLessThan(20);
  });

  it("reads higher for a woman with identical folds, as the equations intend", () => {
    const male = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "masculino",
      birthDate: "1996-01-01",
      onDate: "2026-01-01",
    })!;
    const female = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "feminino",
      birthDate: "1996-01-01",
      onDate: "2026-01-01",
    })!;
    expect(female).toBeGreaterThan(male);
  });

  it("ages upward: the same folds read fatter on an older person", () => {
    const young = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "masculino",
      birthDate: "2001-01-01",
      onDate: "2026-01-01",
    })!;
    const older = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "masculino",
      birthDate: "1971-01-01",
      onDate: "2026-01-01",
    })!;
    expect(older).toBeGreaterThan(young);
  });

  it("is null without a sex or a birth date — it cannot be guessed", () => {
    const base = { skinfolds: SEVEN, onDate: "2026-01-01" };
    expect(
      bodyFatFromSkinfolds({ ...base, sex: null, birthDate: "1996-01-01" }),
    ).toBeNull();
    expect(
      bodyFatFromSkinfolds({ ...base, sex: "masculino", birthDate: null }),
    ).toBeNull();
  });

  it("is null for an incomplete protocol rather than a rougher estimate", () => {
    const { peitoral: _p, ...six } = SEVEN;
    void _p;
    expect(
      bodyFatFromSkinfolds({
        skinfolds: six,
        sex: "masculino",
        birthDate: "1996-01-01",
        onDate: "2026-01-01",
      }),
    ).toBeNull();
  });

  it("refuses an implausible result instead of storing it", () => {
    // Millimetres typed as centimetres: every fold ten times too large. The
    // polynomial happily returns a number; it is not one to put in a record.
    const wild = Object.fromEntries(
      Object.entries(SEVEN).map(([k, v]) => [k, v * 10]),
    ) as CheckinSkinfolds;
    expect(
      bodyFatFromSkinfolds({
        skinfolds: wild,
        sex: "masculino",
        birthDate: "1996-01-01",
        onDate: "2026-01-01",
      }),
    ).toBeNull();
  });

  it("rounds to one decimal — the precision the protocol supports", () => {
    const pct = bodyFatFromSkinfolds({
      skinfolds: SEVEN,
      sex: "masculino",
      birthDate: "1996-01-01",
      onDate: "2026-01-01",
    })!;
    expect(pct).toBe(Math.round(pct * 10) / 10);
  });

  it("Siri inverts density into a percentage", () => {
    expect(siriBodyFatPct(1.05)).toBeCloseTo(21.4, 1);
  });
});

describe("derivedMasses", () => {
  it("makes massa magra the complement of fat, by definition", () => {
    const m = derivedMasses(20, 80);
    expect(m.leanMassPct).toBe(80);
    expect(m.leanMassKg).toBe(64);
    expect(m.fatMassKg).toBe(16);
  });

  it("gives the percentage without a weight, and no kilograms", () => {
    const m = derivedMasses(20, null);
    expect(m.leanMassPct).toBe(80);
    expect(m.leanMassKg).toBeNull();
    expect(m.fatMassKg).toBeNull();
  });

  it("is all null without a percentage — nothing to derive from", () => {
    expect(derivedMasses(null, 80)).toEqual({
      leanMassPct: null,
      leanMassKg: null,
      fatMassKg: null,
    });
  });

  it("keeps the two masses adding up to the body weight", () => {
    const m = derivedMasses(18.4, 82.5);
    expect(m.leanMassKg! + m.fatMassKg!).toBeCloseTo(82.5, 1);
  });
});
