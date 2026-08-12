import { describe, expect, it } from "vitest";

import {
  buildTeamDto,
  canInviteCoach,
  coachInitials,
  coachInviteSchema,
  planSupportsTeam,
} from "@/lib/coaches";

describe("coachInitials", () => {
  it("takes first + last initials", () => {
    expect(coachInitials("Thiago Corrêa")).toBe("TC");
    expect(coachInitials("  ana   paula  silva ")).toBe("AS");
  });
  it("falls back to two letters for a single name, and ? for blank", () => {
    expect(coachInitials("Bianca")).toBe("BI");
    expect(coachInitials("   ")).toBe("?");
  });
});

describe("canInviteCoach", () => {
  it("allows below the cap, blocks at/over it, and treats null as unlimited", () => {
    expect(canInviteCoach(2, 3)).toBe(true);
    expect(canInviteCoach(3, 3)).toBe(false);
    expect(canInviteCoach(4, 3)).toBe(false);
    expect(canInviteCoach(999, null)).toBe(true);
  });
});

describe("planSupportsTeam", () => {
  it("is false for a single seat, true for more than one or unlimited", () => {
    expect(planSupportsTeam(1)).toBe(false);
    expect(planSupportsTeam(3)).toBe(true);
    expect(planSupportsTeam(null)).toBe(true);
  });
});

describe("coachInviteSchema", () => {
  it("accepts and normalizes a valid invite (trim + lowercase e-mail)", () => {
    const parsed = coachInviteSchema.parse({
      name: "  Bianca Reis  ",
      email: "  Bianca@Email.COM ",
    });
    expect(parsed).toEqual({ name: "Bianca Reis", email: "bianca@email.com" });
  });
  it("rejects a bad e-mail and a too-short name", () => {
    expect(coachInviteSchema.safeParse({ name: "B", email: "x" }).success).toBe(
      false,
    );
    expect(
      coachInviteSchema.safeParse({ name: "Ok", email: "not-an-email" }).success,
    ).toBe(false);
  });
});

describe("buildTeamDto — seat accounting", () => {
  const coaches = [
    { id: "owner", name: "Thiago Corrêa", email: "t@c.com", isOwner: true, studentCount: 7 },
    { id: "c2", name: "Bianca Reis", email: "b@c.com", isOwner: false, studentCount: 5 },
  ];

  it("counts a pending invite as a used seat and blocks at the cap", () => {
    const dto = buildTeamDto({
      plan: "clinica",
      maxCoaches: 3,
      coaches,
      pendingInvites: [{ id: "i1", name: "Novo Coach", email: "n@c.com" }],
    });
    expect(dto.planName).toBe("Clínica");
    expect(dto.occupied).toBe(2);
    expect(dto.pendingCount).toBe(1);
    expect(dto.seatsUsed).toBe(3);
    expect(dto.canInvite).toBe(false);
    expect(dto.coaches[0].initials).toBe("TC");
    expect(dto.pendingInvites[0].initials).toBe("NC");
  });

  it("allows another invite while a seat is free", () => {
    const dto = buildTeamDto({
      plan: "clinica",
      maxCoaches: 3,
      coaches,
      pendingInvites: [],
    });
    expect(dto.seatsUsed).toBe(2);
    expect(dto.canInvite).toBe(true);
  });

  it("stays uncapped for an unlimited plan", () => {
    const dto = buildTeamDto({
      plan: "enterprise",
      maxCoaches: null,
      coaches,
      pendingInvites: [],
    });
    expect(dto.canInvite).toBe(true);
    expect(dto.maxCoaches).toBeNull();
  });
});
