import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  DEFAULT_ROLE,
  ROLE_LABELS,
  homePathForRole,
  isAdmin,
  isCoach,
  isRole,
} from "@/lib/roles";

describe("roles", () => {
  it("defaults new users to coach", () => {
    expect(DEFAULT_ROLE).toBe("coach");
  });

  it("treats only admin as a super-admin role", () => {
    expect(ADMIN_ROLES).toEqual(["admin"]);
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin("coach")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("identifies coaches", () => {
    expect(isCoach("coach")).toBe(true);
    expect(isCoach("aluno")).toBe(false);
  });

  it("validates known roles", () => {
    expect(isRole("coach")).toBe(true);
    expect(isRole("aluno")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(42)).toBe(false);
  });

  it("has a PT-BR label for every role", () => {
    expect(ROLE_LABELS.coach).toBe("Coach");
    expect(ROLE_LABELS.aluno).toBe("Aluno");
    expect(ROLE_LABELS.admin).toBe("Administrador");
  });

  it("routes each role to its home area", () => {
    expect(homePathForRole("coach")).toBe("/dashboard");
    expect(homePathForRole("aluno")).toBe("/dashboard/aluno");
    expect(homePathForRole("admin")).toBe("/dashboard/admin");
    // Unknown / missing role falls back to the coach dashboard.
    expect(homePathForRole(undefined)).toBe("/dashboard");
    expect(homePathForRole(null)).toBe("/dashboard");
  });
});
