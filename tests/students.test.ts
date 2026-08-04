import { describe, expect, it } from "vitest";

import {
  acceptInviteSchema,
  avatarColor,
  deriveAccess,
  deriveStudentState,
  isAtStudentLimit,
  studentFormSchema,
  studentInitials,
  studentStatusSchema,
} from "@/lib/students";

describe("studentFormSchema", () => {
  const valid = {
    firstName: "Ana",
    lastName: "Aluna",
    email: "ANA@Email.com ",
    phone: "",
    goal: "",
    modality: "online",
  };

  it("accepts a valid student and normalizes the e-mail", () => {
    const result = studentFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("ana@email.com");
  });

  it("turns empty optional text into null", () => {
    const result = studentFormSchema.parse(valid);
    expect(result.phone).toBeNull();
    expect(result.goal).toBeNull();
  });

  it("keeps provided optional text", () => {
    const result = studentFormSchema.parse({
      ...valid,
      phone: " 11999 ",
      goal: "Hipertrofia",
    });
    expect(result.phone).toBe("11999");
    expect(result.goal).toBe("Hipertrofia");
  });

  it("requires first and last name", () => {
    expect(studentFormSchema.safeParse({ ...valid, firstName: "" }).success).toBe(
      false,
    );
    expect(studentFormSchema.safeParse({ ...valid, lastName: "" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid e-mail", () => {
    expect(studentFormSchema.safeParse({ ...valid, email: "nope" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown modality", () => {
    expect(
      studentFormSchema.safeParse({ ...valid, modality: "hybrid" }).success,
    ).toBe(false);
  });
});

describe("studentStatusSchema", () => {
  it("accepts known statuses and rejects others", () => {
    expect(studentStatusSchema.safeParse({ status: "archived" }).success).toBe(true);
    expect(studentStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});

describe("acceptInviteSchema", () => {
  it("requires a token and an 8+ char password", () => {
    expect(
      acceptInviteSchema.safeParse({ token: "t", password: "supersegura" }).success,
    ).toBe(true);
    expect(
      acceptInviteSchema.safeParse({ token: "t", password: "short" }).success,
    ).toBe(false);
    expect(
      acceptInviteSchema.safeParse({ token: "", password: "supersegura" }).success,
    ).toBe(false);
  });
});

describe("deriveStudentState", () => {
  it("marks archived regardless of other flags", () => {
    expect(
      deriveStudentState({ status: "archived", hasAccount: true, pendingInvite: true }).key,
    ).toBe("archived");
  });

  it("marks a pending invite with no account as invited", () => {
    expect(
      deriveStudentState({ status: "active", hasAccount: false, pendingInvite: true }).key,
    ).toBe("invited");
  });

  it("shows the login as active/inactive once there's an account", () => {
    expect(
      deriveStudentState({ status: "active", hasAccount: true, pendingInvite: false }).key,
    ).toBe("active");
    expect(
      deriveStudentState({ status: "inactive", hasAccount: true, pendingInvite: false }).key,
    ).toBe("inactive");
  });
});

describe("isAtStudentLimit", () => {
  it("treats null as unlimited", () => {
    expect(isAtStudentLimit(9999, null)).toBe(false);
  });
  it("blocks at or above the cap (free = 3 blocks the 4th)", () => {
    expect(isAtStudentLimit(2, 3)).toBe(false);
    expect(isAtStudentLimit(3, 3)).toBe(true);
    expect(isAtStudentLimit(4, 3)).toBe(true);
  });
});

describe("access + avatar helpers", () => {
  it("derives portal vs offline access", () => {
    expect(deriveAccess({ hasAccount: true })).toBe("portal");
    expect(deriveAccess({ hasAccount: false })).toBe("offline");
  });

  it("builds two-letter initials", () => {
    expect(studentInitials("ana", "aluna")).toBe("AA");
  });

  it("is deterministic for the same seed", () => {
    expect(avatarColor("abc")).toBe(avatarColor("abc"));
  });
});
