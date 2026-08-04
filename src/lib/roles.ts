import type { Role } from "@/db/schema";

export type { Role };

/** Human-readable, PT-BR labels for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  coach: "Coach",
  aluno: "Aluno",
  admin: "Administrador",
};

/** The role assigned to every self-service sign-up. */
export const DEFAULT_ROLE: Role = "coach";

/** Roles treated as platform super admins by the Better Auth admin plugin. */
export const ADMIN_ROLES: Role[] = ["admin"];

export function isRole(value: unknown): value is Role {
  return value === "coach" || value === "aluno" || value === "admin";
}

export function isAdmin(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role as Role);
}

export function isCoach(role: string | null | undefined): boolean {
  return role === "coach";
}

/**
 * Normalizes the single bootstrap admin e-mail (the `ADMIN_EMAIL` env var).
 * Exactly one admin is seeded this way; any further admins will be added via
 * the application in the future. Admins are never self-selectable.
 */
export function bootstrapAdminEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase();
  return email ? email : null;
}

/** Whether an e-mail is the configured bootstrap admin. */
export function isAdminEmail(
  email: string,
  adminEmail: string | null,
): boolean {
  return adminEmail !== null && email.trim().toLowerCase() === adminEmail;
}

/**
 * The single area a role is allowed into. Roles are fully siloed: each maps to
 * its own route subtree and no role may enter another's. Unknown roles fall
 * back to the neutral `/dashboard` dispatcher, which re-routes or bounces to
 * login.
 */
export function homePathForRole(role: string | null | undefined): string {
  if (role === "coach") return "/coach";
  if (role === "aluno") return "/student";
  if (isAdmin(role)) return "/admin";
  return "/dashboard";
}
