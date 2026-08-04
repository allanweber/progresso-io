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
 * Parses the admin allowlist (the `ADMIN_EMAILS` env var) — a list of e-mails
 * separated by commas, semicolons or whitespace, normalized to lowercase.
 * Admins aren't self-selectable; membership here is the only thing that grants
 * the admin role at sign-up.
 */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether an e-mail is in the configured admin allowlist. */
export function isAdminEmail(email: string, allowlist: string[]): boolean {
  return allowlist.includes(email.trim().toLowerCase());
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
