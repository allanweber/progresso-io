import { describe, expect, it } from "vitest";

import {
  acceptInviteSchema,
  avatarPalette,
  deriveAccess,
  deriveStudentState,
  isAtStudentLimit,
  makeStudentRegistrationSchema,
  studentFormSchema,
  studentInitials,
  studentStatusSchema,
} from "@/lib/students";

describe("studentFormSchema", () => {
  // Base fixture is OFFLINE (in_person), so e-mail/WhatsApp are optional and the
  // "empty → null" behaviour is exercisable; the online rule is tested below.
  const valid = {
    firstName: "Ana",
    lastName: "Aluna",
    email: "ANA@Email.com ",
    phone: "",
    goal: "",
    modality: "in_person",
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

  it("normalizes the WhatsApp number (BR +55 assumed)", () => {
    const result = studentFormSchema.parse({
      ...valid,
      phone: "(11) 99999-0000",
      goal: "Hipertrofia",
    });
    expect(result.phone).toBe("5511999990000");
    expect(result.goal).toBe("Hipertrofia");
  });

  it("requires WhatsApp and e-mail for online students", () => {
    // Online + missing phone → invalid.
    expect(
      studentFormSchema.safeParse({ ...valid, modality: "online", email: "a@b.com" })
        .success,
    ).toBe(false);
    // Online + missing e-mail → invalid.
    expect(
      studentFormSchema.safeParse({
        ...valid,
        modality: "online",
        phone: "11999990000",
        email: "",
      }).success,
    ).toBe(false);
    // Online + both present → valid.
    expect(
      studentFormSchema.safeParse({
        ...valid,
        modality: "online",
        phone: "11999990000",
        email: "a@b.com",
      }).success,
    ).toBe(true);
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

describe("makeStudentRegistrationSchema — plan-aware + optional anamnese", () => {
  const online = {
    firstName: "Ana",
    lastName: "Aluna",
    email: "",
    phone: "",
    goal: "",
    modality: "online" as const,
    anamnesisId: "",
  };

  it("requires WhatsApp + e-mail for an online student on a WhatsApp plan", () => {
    const res = makeStudentRegistrationSchema(true).safeParse(online);
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toEqual(expect.arrayContaining(["email", "phone"]));
    }
  });

  it("requires neither on a free plan (no WhatsApp)", () => {
    const res = makeStudentRegistrationSchema(false).safeParse(online);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.anamnesisId).toBeNull();
  });

  it("keeps the anamnese optional (empty → null) but validates a bad id", () => {
    const free = makeStudentRegistrationSchema(false);
    expect(free.safeParse({ ...online, anamnesisId: "" }).success).toBe(true);
    expect(free.safeParse({ ...online, anamnesisId: "not-a-uuid" }).success).toBe(
      false,
    );
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
    expect(avatarPalette("abc")).toEqual(avatarPalette("abc"));
  });

  // The palette is wash + darkened ink, like every other chip in the system.
  // White-on-saturated failed AA on all eight of the old hues, and two of them
  // were the brand's emerald and the danger red — pigments that mean something.
  it("keeps every avatar pair readable and free of semantic pigments", () => {
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { bg, fg } = avatarPalette(`seed-${i}`);
      seen.add(`${bg}/${fg}`);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      // Vital Emerald and the destructive red belong to state, never to identity.
      expect([bg.toUpperCase(), fg.toUpperCase()]).not.toContain("#059669");
      expect([bg.toUpperCase(), fg.toUpperCase()]).not.toContain("#EF4444");
    }
    expect(seen.size).toBe(8);
  });
});
