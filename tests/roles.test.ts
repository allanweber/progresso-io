import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  DEFAULT_ROLE,
  ROLE_LABELS,
  bootstrapAdminEmail,
  homePathForRole,
  isAdmin,
  isAdminEmail,
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

  it("normalizes the single bootstrap admin e-mail", () => {
    expect(bootstrapAdminEmail(undefined)).toBeNull();
    expect(bootstrapAdminEmail("")).toBeNull();
    expect(bootstrapAdminEmail("  Boss@Progresso.io ")).toBe(
      "boss@progresso.io",
    );
  });

  it("matches the bootstrap admin e-mail case-insensitively", () => {
    const adminEmail = bootstrapAdminEmail("boss@progresso.io");
    expect(isAdminEmail("Boss@Progresso.io", adminEmail)).toBe(true);
    expect(isAdminEmail("someone@progresso.io", adminEmail)).toBe(false);
    // Not configured → nobody is admin by e-mail.
    expect(isAdminEmail("boss@progresso.io", null)).toBe(false);
  });

  it("routes each role to its own siloed area", () => {
    expect(homePathForRole("coach")).toBe("/coach");
    expect(homePathForRole("aluno")).toBe("/student");
    expect(homePathForRole("admin")).toBe("/admin");
    // Unknown / missing role falls back to the neutral dispatcher.
    expect(homePathForRole(undefined)).toBe("/dashboard");
    expect(homePathForRole(null)).toBe("/dashboard");
  });
});
