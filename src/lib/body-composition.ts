import type { Sex } from "@/db/schema";
import {
  SKINFOLD_SITES,
  type CheckinSkinfolds,
} from "@/lib/checkin-assessment";

/**
 * Body composition arithmetic. Pure, client-safe, no I/O.
 *
 * **This is the server's answer, not the model's.** The AI evaluation asks a
 * vision model to look at four photos and guess a body-fat percentage, which is
 * the best available answer when there is nothing better — but when the coach
 * actually ran calipers there IS something better, and it is a polynomial. Same
 * rule the diet generator already follows in `src/server/ai/rebalance.ts`: what
 * the server can compute exactly, it computes, and the model's version of that
 * number is discarded rather than reconciled.
 *
 * The protocol is **Jackson-Pollock 7-site → Siri**, and it is all-or-nothing:
 * seven folds, a sex and an age, or no number at all. Feeding the equation four
 * of its seven terms does not produce a rougher estimate, it produces a wrong
 * one — the polynomial is fitted to the sum of all seven sites.
 */

/**
 * Whole years between a birth date and a reference date.
 *
 * Both are `YYYY-MM-DD` calendar strings and are compared as such, with no
 * `Date` parsing and therefore no timezone: `new Date("1990-03-14")` is UTC
 * midnight, which in São Paulo is the evening of the 13th, and an age that
 * ticks over a day early is exactly the kind of silent off-by-one that never
 * gets noticed in a body-fat percentage.
 */
export function ageOnDate(birthDate: string, onDate: string): number | null {
  const birth = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const on = onDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!birth || !on) return null;
  const [by, bm, bd] = [birth[1], birth[2], birth[3]].map(Number);
  const [oy, om, od] = [on[1], on[2], on[3]].map(Number);
  let age = oy - by;
  // Birthday not yet reached this year.
  if (om < bm || (om === bm && od < bd)) age -= 1;
  // Outside this range the equation is being applied to someone it was never
  // fitted for (it is validated on adults), and a negative age means the dates
  // are the wrong way round.
  return age >= 15 && age <= 100 ? age : null;
}

/**
 * The seven folds as one sum, or `null` if any site is missing.
 *
 * Missing means *absent*, not zero: a skinfold of 0 mm does not exist on a
 * living person, so a stored 0 is a typo or a placeholder and is treated as
 * unmeasured rather than folded into the sum.
 */
export function skinfoldSum(skinfolds: CheckinSkinfolds): number | null {
  let sum = 0;
  for (const site of SKINFOLD_SITES) {
    const value = skinfolds[site];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    sum += value;
  }
  return sum;
}

/**
 * Body density from the 7-site sum, by Jackson-Pollock (1978).
 *
 * Two equations, one per sex, and this is the whole reason `students.sex` had
 * to exist: the same 100 mm of fold means a materially different density in a
 * man and a woman, so guessing the sex would be guessing the answer.
 */
export function bodyDensity7Site(
  sumMm: number,
  sex: Sex,
  age: number,
): number {
  return sex === "masculino"
    ? 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm * sumMm - 0.00028826 * age
    : 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm * sumMm - 0.00012828 * age;
}

/** Body fat percentage from body density (Siri, 1961). */
export function siriBodyFatPct(density: number): number {
  return 495 / density - 450;
}

/** What the skinfold path needs, and what it could not produce without. */
export type SkinfoldInput = {
  skinfolds: CheckinSkinfolds;
  sex: Sex | null;
  birthDate: string | null;
  /** The check-in's date — the age that matters is the age on the day. */
  onDate: string;
};

/**
 * Body fat from calipers, or `null` when the protocol is incomplete.
 *
 * `null` is not a failure — it is the ladder working: no number here means the
 * evaluation falls through to the model's visual estimate, which is what a
 * coach who measured nothing was always going to get.
 */
export function bodyFatFromSkinfolds(input: SkinfoldInput): number | null {
  if (!input.sex || !input.birthDate) return null;
  const age = ageOnDate(input.birthDate, input.onDate);
  if (age === null) return null;
  const sum = skinfoldSum(input.skinfolds);
  if (sum === null) return null;

  const pct = siriBodyFatPct(bodyDensity7Site(sum, input.sex, age));
  // Outside this band the equation has been handed folds it cannot explain
  // (a transposed digit, millimetres entered as centimetres). Refusing beats
  // writing 3% into an aluno's record.
  if (!Number.isFinite(pct) || pct < 3 || pct > 65) return null;
  return round1(pct);
}

/** One decimal — the precision the protocol actually supports. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The masses that follow from a body-fat percentage and a body weight.
 *
 * **Massa magra is the complement of fat, by definition** — muscle, bone, water
 * and organs together. It is not muscle mass, and nothing here estimates muscle
 * mass: that is a genuinely separate quantity that neither calipers nor a photo
 * can give, and labelling the complement as "músculo" would be inventing a
 * clinical claim out of a subtraction.
 *
 * `weightKg` is optional because an online check-in can arrive without one, and
 * a percentage is still worth showing when the kilograms are not computable.
 */
export function derivedMasses(
  bodyFatPct: number | null,
  weightKg: number | null,
): {
  leanMassPct: number | null;
  leanMassKg: number | null;
  fatMassKg: number | null;
} {
  if (bodyFatPct === null || !Number.isFinite(bodyFatPct)) {
    return { leanMassPct: null, leanMassKg: null, fatMassKg: null };
  }
  const leanMassPct = round1(100 - bodyFatPct);
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { leanMassPct, leanMassKg: null, fatMassKg: null };
  }
  return {
    leanMassPct,
    leanMassKg: round1((weightKg * leanMassPct) / 100),
    fatMassKg: round1((weightKg * bodyFatPct) / 100),
  };
}

/**
 * The bounds a coach's edited body-fat percentage must land inside.
 *
 * Wide on purpose: this is a guard against a slipped decimal point, not a
 * second opinion on the coach's judgement. They measured the person; we did not.
 */
export const BODY_FAT_MIN = 3;
export const BODY_FAT_MAX = 65;
