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

/** Landing route for a user based on their role after signing in. */
export function homePathForRole(role: string | null | undefined): string {
  if (isAdmin(role)) return "/dashboard/admin";
  if (role === "aluno") return "/dashboard/aluno";
  return "/dashboard";
}
