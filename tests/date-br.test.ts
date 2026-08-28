import { describe, expect, it } from "vitest";

import { todayYmd } from "@/lib/calendar";
import { brToIso, isoToBr, maskBrDate } from "@/lib/date-br";
import { CHECKIN_MIN_DATE, checkinDateSchema } from "@/lib/student-checkins";

/**
 * Dates are typed and shown as `dd/mm/aaaa` on every device — the reason the
 * app stopped using `<input type="date">`, which renders in the *device* locale
 * and so silently swaps day and month on a machine set to en-US. These cover the
 * mask/parse pair that guarantee the format, and the check-in date rule that
 * lets a coach import the past but never invent the future.
 */

describe("dd/mm/aaaa masking", () => {
  it("inserts the slashes as the digits arrive", () => {
    expect(maskBrDate("2")).toBe("2");
    expect(maskBrDate("28")).toBe("28");
    expect(maskBrDate("2808")).toBe("28/08");
    expect(maskBrDate("28082026")).toBe("28/08/2026");
  });

  it("ignores non-digits and never overruns eight digits", () => {
    expect(maskBrDate("28/08/2026")).toBe("28/08/2026");
    expect(maskBrDate("a2b8c0d8e2f0g2h6i9")).toBe("28/08/2026");
  });
});

describe("brToIso / isoToBr", () => {
  it("round-trips a real date", () => {
    expect(brToIso("28/08/2026")).toBe("2026-08-28");
    expect(isoToBr("2026-08-28")).toBe("28/08/2026");
  });

  it("refuses a date the calendar does not have", () => {
    expect(brToIso("31/02/2024")).toBeNull(); // would silently roll to 02/03
    expect(brToIso("29/02/2025")).toBeNull(); // not a leap year
    expect(brToIso("29/02/2024")).toBe("2024-02-29"); // this one is
    expect(brToIso("00/08/2026")).toBeNull();
    expect(brToIso("28/13/2026")).toBeNull();
  });

  it("treats anything incomplete as no date at all", () => {
    expect(brToIso("28/08")).toBeNull();
    expect(brToIso("")).toBeNull();
    expect(isoToBr("")).toBe("");
    expect(isoToBr("not-a-date")).toBe("");
  });
});

describe("check-in date rule", () => {
  it("accepts today and any past date back to the floor", () => {
    expect(checkinDateSchema.safeParse(todayYmd()).success).toBe(true);
    expect(checkinDateSchema.safeParse("2024-03-11").success).toBe(true);
    expect(checkinDateSchema.safeParse(CHECKIN_MIN_DATE).success).toBe(true);
  });

  it("refuses the future — it would push the student's next check-in out", () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 2);
    const parsed = checkinDateSchema.safeParse(soon.toISOString().slice(0, 10));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("A data não pode ser futura.");
  });

  it("refuses a mistyped year and an impossible day", () => {
    expect(checkinDateSchema.safeParse("0204-03-11").success).toBe(false);
    expect(checkinDateSchema.safeParse("2024-02-31").success).toBe(false);
    expect(checkinDateSchema.safeParse("11/03/2024").success).toBe(false);
  });
});
