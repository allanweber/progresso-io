import { describe, expect, it } from "vitest";

import {
  formatPhone,
  isValidPhone,
  normalizePhone,
  phonesMatch,
  whatsappHref,
} from "@/lib/phone";

/**
 * The WhatsApp number is the aluno's identifier: it's what the fill link is
 * confirmed against and what messages are delivered to, so how a free-typed
 * number becomes canonical digits is load-bearing. These cover the two shapes
 * that used to break — a number typed with an explicit `+` country code, and
 * the same number typed with and without its national trunk `0`.
 */

describe("normalizePhone", () => {
  it("assumes Brazil for a bare local number", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("5511999990000");
    expect(normalizePhone("11 3000-0000")).toBe("551130000000");
  });

  it("keeps a number that already carries +55", () => {
    expect(normalizePhone("+55 11 99999-0000")).toBe("5511999990000");
    expect(normalizePhone("5511999990000")).toBe("5511999990000");
  });

  it("never glues 55 onto a number typed with an explicit country code", () => {
    // 11 digits, but the `+` says the country code is already there — this used
    // to come out as 5531636051199, a number nobody can be reached on.
    expect(normalizePhone("+31 636051199")).toBe("31636051199");
    expect(normalizePhone("+1 4155550123")).toBe("14155550123");
  });

  it("drops the national trunk 0 after the country code", () => {
    expect(normalizePhone("+31 06 3605 1199")).toBe("31636051199");
    expect(normalizePhone("0031 06 3605 1199")).toBe("31636051199");
  });

  it("keeps the leading zero where it is part of the number (Italy)", () => {
    expect(normalizePhone("+39 06 6982")).toBe("39066982");
  });

  it("returns null when there's nothing usable", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("  —  ")).toBeNull();
  });
});

describe("phonesMatch", () => {
  it("matches the same number typed in different shapes", () => {
    expect(phonesMatch("11999990000", "+55 (11) 99999-0000")).toBe(true);
    expect(phonesMatch("+31 06 3605 1199", "+31 636051199")).toBe(true);
    // A number stored before trunk prefixes were canonicalized.
    expect(phonesMatch("+31 636051199", "310636051199")).toBe(true);
  });

  it("rejects a different number", () => {
    expect(phonesMatch("+31 636051199", "+31 636061199")).toBe(false);
    expect(phonesMatch("11999990000", "11999990001")).toBe(false);
  });

  it("rejects a missing number on either side", () => {
    expect(phonesMatch(null, "11999990000")).toBe(false);
    expect(phonesMatch("11999990000", "")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formats a Brazilian number", () => {
    expect(formatPhone("5511999990000")).toBe("+55 (11) 99999-0000");
    expect(formatPhone("551130000000")).toBe("+55 (11) 3000-0000");
  });

  it("keeps the + on an international number", () => {
    expect(formatPhone("31636051199")).toBe("+31 636051199");
    expect(formatPhone("14155550123")).toBe("+1 4155550123");
  });

  it("round-trips back through normalizePhone", () => {
    for (const stored of ["5511999990000", "31636051199", "14155550123"]) {
      expect(normalizePhone(formatPhone(stored))).toBe(stored);
    }
  });

  it("is empty for a missing number", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("")).toBe("");
  });
});

describe("isValidPhone / whatsappHref", () => {
  it("accepts international lengths", () => {
    expect(isValidPhone("+31 636051199")).toBe(true);
    expect(isValidPhone("(11) 99999-0000")).toBe(true);
    expect(isValidPhone("1199")).toBe(false);
  });

  it("links to wa.me with digits only", () => {
    expect(whatsappHref("5511999990000")).toBe("https://wa.me/5511999990000");
    expect(whatsappHref(null)).toBe("");
  });
});
