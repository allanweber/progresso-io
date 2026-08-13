import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  computeCheckinDue,
  monthGridDays,
  snapToWeekday,
  startOfMonth,
  todayYmd,
  WEEKDAY_INDEX,
  weekdayOf,
  weekDays,
} from "@/lib/calendar";

/**
 * Pure calendar date-math + the derived check-in computation. No DB — these are
 * the building blocks the DAL and the calendar page rely on, so they're worth
 * pinning down deterministically (a fixed "now" is injected for the TZ tests).
 */

describe("todayYmd (America/Sao_Paulo)", () => {
  it("uses the São Paulo calendar day, not UTC's", () => {
    // 01:00 UTC on the 13th is still 22:00 on the 12th in UTC-3.
    expect(todayYmd(new Date("2026-08-13T01:00:00Z"))).toBe("2026-08-12");
    // Midday UTC is the same day in São Paulo.
    expect(todayYmd(new Date("2026-08-13T15:00:00Z"))).toBe("2026-08-13");
  });
});

describe("day arithmetic", () => {
  it("adds and subtracts whole days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-08-13", 7)).toBe("2026-08-20");
  });

  it("weekdayOf returns 0=Sunday … 6=Saturday", () => {
    // 2026-08-16 is a Sunday.
    expect(weekdayOf("2026-08-16")).toBe(0);
    expect(weekdayOf("2026-08-17")).toBe(1); // Monday
  });
});

describe("snapToWeekday", () => {
  it("returns the same day when it already matches", () => {
    const monday = "2026-08-17";
    expect(snapToWeekday(monday, WEEKDAY_INDEX.monday)).toBe(monday);
  });

  it("rolls forward to the next matching weekday (< 7 days)", () => {
    const result = snapToWeekday("2026-08-13", WEEKDAY_INDEX.monday);
    expect(weekdayOf(result)).toBe(1);
    expect(result >= "2026-08-13").toBe(true);
    expect(result <= "2026-08-20").toBe(true);
  });
});

describe("month grid", () => {
  it("is 42 days, Sunday-first, and contains the anchor's month", () => {
    const grid = monthGridDays("2026-08-13");
    expect(grid).toHaveLength(42);
    expect(weekdayOf(grid[0])).toBe(0); // starts on a Sunday
    expect(grid).toContain("2026-08-13");
    expect(grid[0] <= startOfMonth("2026-08-13")).toBe(true);
  });

  it("addMonths shifts to the first of another month", () => {
    expect(addMonths("2026-08-13", 1)).toBe("2026-09-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("weekDays is 7 consecutive Sunday-first days", () => {
    const days = weekDays("2026-08-13");
    expect(days).toHaveLength(7);
    expect(weekdayOf(days[0])).toBe(0);
    expect(addDays(days[0], 6)).toBe(days[6]);
  });
});

describe("computeCheckinDue", () => {
  it("projects forward by the interval, keeping the base weekday", () => {
    // 2026-08-13 is a Thursday; +7 days stays Thursday, in the future.
    const due = computeCheckinDue({
      today: "2026-08-13",
      lastCheckinDate: null,
      createdDate: "2026-08-13",
      frequency: "semanal",
    });
    expect(due.overdue).toBe(false);
    expect(due.date).toBe("2026-08-20");
    expect(weekdayOf(due.date)).toBe(weekdayOf("2026-08-13"));
  });

  it("keeps the last check-in's weekday (not a global preferred day)", () => {
    // Last check-in on a Wednesday → next due is the following Wednesday.
    const base = "2026-08-12"; // Wednesday
    const due = computeCheckinDue({
      today: "2026-08-13",
      lastCheckinDate: base,
      createdDate: "2026-01-01",
      frequency: "semanal",
    });
    expect(weekdayOf(due.date)).toBe(weekdayOf(base));
    expect(due.date).toBe("2026-08-19");
  });

  it("rolls an overdue student forward on the same weekday, flagged red", () => {
    const base = "2026-01-05"; // a Monday, months ago
    const due = computeCheckinDue({
      today: "2026-08-13",
      lastCheckinDate: base,
      createdDate: "2026-01-01",
      frequency: "semanal",
    });
    expect(due.overdue).toBe(true);
    expect(due.date >= "2026-08-13").toBe(true);
    expect(weekdayOf(due.date)).toBe(weekdayOf(base)); // still a Monday
  });

  it("respects the cadence interval (mensal ≈ 4 weeks out)", () => {
    const weekly = computeCheckinDue({
      today: "2026-08-13",
      lastCheckinDate: "2026-08-10",
      createdDate: "2026-08-10",
      frequency: "semanal",
    });
    const monthly = computeCheckinDue({
      today: "2026-08-13",
      lastCheckinDate: "2026-08-10",
      createdDate: "2026-08-10",
      frequency: "mensal",
    });
    expect(monthly.date > weekly.date).toBe(true);
  });
});
