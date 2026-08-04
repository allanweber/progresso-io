import type { Modality, StudentStatus } from "@/db/schema";
import { z } from "@/lib/validation";

/**
 * Client-safe student domain: enum values, PT-BR labels, and the zod schemas
 * shared by the API route handlers and the TanStack Form on the client. Kept
 * free of any server/database import (only erased `import type`s from the
 * schema) so it bundles into client components. The literal arrays are checked
 * against the schema's types via `satisfies`, keeping them in sync.
 */

export const MODALITY_VALUES = ["online", "in_person"] as const satisfies readonly Modality[];
export const STATUS_VALUES = ["active", "inactive", "archived"] as const satisfies readonly StudentStatus[];

export const MODALITY_LABELS: Record<Modality, string> = {
  online: "Online",
  in_person: "Presencial",
};

export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado",
};

/** Access label shown in the roster/profile, derived from account state. */
export const ACCESS_LABELS = {
  portal: "Portal",
  offline: "Offline",
} as const;

/** The state shown in the roster's "Estado" column and the profile badge. */
export type StudentStateKey = "active" | "inactive" | "invited" | "archived";

type StudentStateInput = {
  status: StudentStatus;
  hasAccount: boolean;
  pendingInvite: boolean;
};

/**
 * Collapses status + invite/account flags into the single state the UI shows.
 * "Convidado" is derived (a pending invite with no login yet), not a stored
 * status. Archived wins over everything.
 */
export function deriveStudentState(s: StudentStateInput): {
  key: StudentStateKey;
  label: string;
} {
  if (s.status === "archived") return { key: "archived", label: "Arquivado" };
  if (!s.hasAccount && s.pendingInvite) {
    return { key: "invited", label: "Convidado" };
  }
  if (s.status === "inactive") return { key: "inactive", label: "Inativo" };
  return { key: "active", label: "Ativo" };
}

/** Portal (has a login) vs Offline (no login yet). */
export function deriveAccess(s: { hasAccount: boolean }): "portal" | "offline" {
  return s.hasAccount ? "portal" : "offline";
}

/**
 * Whether a clinic at `count` active students has hit its plan cap. `limit`
 * null means unlimited. Shared by the create route so the rule is testable.
 */
export function isAtStudentLimit(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

/** Two-letter initials for the avatar. */
export function studentInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** Deterministic avatar background so a student keeps the same colour. */
const AVATAR_COLORS = [
  "#059669",
  "#0EA5E9",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#14B8A6",
  "#6366F1",
  "#EF4444",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * The e-mail rule: always required (for communication) even when the student
 * never logs in. Normalized to lowercase.
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

/**
 * A text field that's semantically optional: the form always sends a string
 * (possibly empty), which becomes null. Kept a required string on the input
 * side so it matches the TanStack Form value type (all strings).
 */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => (v.length ? v : null));

/**
 * Create + edit both post this exact shape — one form component drives both, so
 * one schema validates both (see the "one form" decision). `status` is never
 * set here; it changes through the dedicated status/archive endpoints.
 */
export const studentFormSchema = z.object({
  firstName: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  lastName: z
    .string()
    .trim()
    .min(1, "Informe o sobrenome.")
    .max(80, "Sobrenome muito longo."),
  email: emailSchema,
  phone: optionalText(30, "Telefone muito longo."),
  goal: optionalText(200, "Objetivo muito longo."),
  modality: z.enum(MODALITY_VALUES),
});

export type StudentFormInput = z.input<typeof studentFormSchema>;
export type StudentFormValues = z.output<typeof studentFormSchema>;

/** Lifecycle change (reactivate / mark inactive). Archive has its own route. */
export const studentStatusSchema = z.object({
  status: z.enum(STATUS_VALUES),
});

/** Aluno activates their login by setting a password against an invite token. */
export const acceptInviteSchema = z.object({
  token: z.string().min(1, "Convite inválido."),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});
