import type { Modality, StudentStatus } from "@/db/schema";
import { z } from "@/lib/validation";
import { normalizePhone } from "@/lib/phone";

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

/** Badge colours per state, shared by the roster and the profile. */
export const STUDENT_STATE_STYLES: Record<
  StudentStateKey,
  { color: string; bg: string }
> = {
  active: { color: "#047857", bg: "#DCFCE7" },
  inactive: { color: "#92400E", bg: "#FEF3C7" },
  invited: { color: "#1D4ED8", bg: "#DBEAFE" },
  archived: { color: "#64748B", bg: "#F1F5F9" },
};

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

/**
 * Deterministic avatar colours, so a student keeps the same one everywhere.
 *
 * Wash + darkened ink, the same shape as {@link STUDENT_STATE_STYLES} and every
 * chip in the system — not a saturated fill with white initials. Two reasons:
 * white on the old solids landed between 2.1:1 and 4.5:1 (not one of the eight
 * reached AA), and the old set included `#059669` and `#EF4444`, so one aluno in
 * eight wore the brand's "alive" emerald and one in eight wore the danger red on
 * a row that was perfectly healthy. Hue here identifies a person and nothing
 * else; it must not borrow a pigment that means something.
 *
 * Every pair below clears 4.5:1 ink-on-wash and reads as its own token against
 * Paper. Emerald, red and amber stay out: they belong to state.
 */
const AVATAR_PALETTE: { bg: string; fg: string }[] = [
  { bg: "#BAE6FD", fg: "#075985" },
  { bg: "#A5F3FC", fg: "#155E75" },
  { bg: "#99F6E4", fg: "#115E59" },
  { bg: "#C7D2FE", fg: "#3730A3" },
  { bg: "#DDD6FE", fg: "#5B21B6" },
  { bg: "#F5D0FE", fg: "#86198F" },
  { bg: "#FBCFE8", fg: "#9D174D" },
  { bg: "#FED7AA", fg: "#9A3412" },
];

/** The wash/ink pair for a student's avatar. Stable for a given seed. */
export function avatarPalette(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * A student as serialized by the API (timestamps are ISO strings over JSON).
 *
 * Data minimization: the internal tenant/relationship keys (`clinicId`,
 * `coachId`, `userId`) are intentionally NOT part of the client payload — the
 * UI never needs them, and the account/coach relationship the client does need
 * is exposed via the derived `hasAccount` flag instead of the raw `userId`. The
 * API strips them with {@link toStudentDto} before responding.
 */
export type StudentDto = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  goal: string | null;
  status: StudentStatus;
  modality: Modality;
  createdAt: string;
  updatedAt: string;
};

/** A student plus the roster's derived access flags. */
export type StudentRosterDto = StudentDto & {
  hasAccount: boolean;
  pendingInvite: boolean;
};

/**
 * Serialization boundary for a student row: drops the internal `clinicId`,
 * `coachId` and `userId` FKs so opaque tenant identifiers never cross to the
 * browser. Access flags (`hasAccount`/`pendingInvite`) are derived from
 * `userId` in the DAL before this runs, so stripping it here loses nothing.
 */
export function toStudentDto<
  T extends { clinicId: string; coachId: string | null; userId: string | null },
>(student: T): Omit<T, "clinicId" | "coachId" | "userId"> {
  const { clinicId: _c, coachId: _co, userId: _u, ...rest } = student;
  void _c;
  void _co;
  void _u;
  return rest;
}

/**
 * E-mail is now **conditional**: required for online students (the portal
 * login) and optional for offline ones. The field always accepts a string
 * (the form sends one); an empty value becomes null, a non-empty one must be a
 * valid e-mail. The online requirement is enforced by the form's superRefine.
 */
const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), z.email("Informe um e-mail válido.")]));

/**
 * WhatsApp: the form sends a free-typed string; we normalize it to canonical
 * digits (Brazil +55 assumed) or null. The normalized form is the per-clinic
 * uniqueness key. The online requirement is enforced by the superRefine.
 */
const phoneSchema = z
  .string()
  .trim()
  .max(30, "Telefone muito longo.")
  .transform((v) => normalizePhone(v));

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

/** The fields common to create + edit. Registration adds `anamnesisId`. */
const studentBaseObject = z.object({
  firstName: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  lastName: z
    .string()
    .trim()
    .min(1, "Informe o sobrenome.")
    .max(80, "Sobrenome muito longo."),
  email: optionalEmailSchema,
  phone: phoneSchema,
  goal: optionalText(200, "Objetivo muito longo."),
  modality: z.enum(MODALITY_VALUES),
});

/**
 * Online students normally need both identifiers (WhatsApp for the links, e-mail
 * for the portal login); offline students may have either or neither. This
 * requirement is **conditional on the clinic having WhatsApp**: on the free plan
 * WhatsApp isn't available, so neither identifier is required even for an online
 * student (`requireContact = false`). The caller derives that from the plan.
 */
function requireOnlineContact(requireContact: boolean) {
  return (
    val: { modality: Modality; email: string | null; phone: string | null },
    ctx: z.RefinementCtx,
  ) => {
    if (!requireContact) return;
    if (val.modality !== "online") return;
    if (!val.email) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "E-mail é obrigatório para alunos online.",
      });
    }
    if (!val.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "WhatsApp é obrigatório para alunos online.",
      });
    }
  };
}

/**
 * Edit (PUT) form schema. `requireContact` (default true) toggles the online
 * WhatsApp/e-mail requirement — free clinics pass false.
 */
export function makeStudentFormSchema(requireContact = true) {
  return studentBaseObject.superRefine(requireOnlineContact(requireContact));
}
export const studentFormSchema = makeStudentFormSchema(true);

export type StudentFormInput = z.input<typeof studentFormSchema>;
export type StudentFormValues = z.output<typeof studentFormSchema>;

/**
 * Registration (the merged "Convidar novo aluno" screen). The anamnese is
 * **optional** — the form sends a string (possibly empty); empty becomes null (no
 * anamnese assigned yet, the coach can add one later), a non-empty value must be
 * a valid id. The conditional online/offline contact rule applies: pass
 * `requireContact = false` for a free clinic (no WhatsApp) so an online student
 * needs neither WhatsApp nor e-mail.
 */
const optionalAnamnesisId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), z.uuid("Anamnese inválida.")]));

export function makeStudentRegistrationSchema(requireContact = true) {
  return studentBaseObject
    .extend({ anamnesisId: optionalAnamnesisId })
    .superRefine(requireOnlineContact(requireContact));
}
export const studentRegistrationSchema = makeStudentRegistrationSchema(true);

export type StudentRegistrationInput = z.input<typeof studentRegistrationSchema>;
export type StudentRegistrationValues = z.output<typeof studentRegistrationSchema>;

/** Lifecycle change (reactivate / mark inactive). Archive has its own route. */
export const studentStatusSchema = z.object({
  status: z.enum(STATUS_VALUES),
});

/** Aluno activates their login by setting a password against an invite token. */
export const acceptInviteSchema = z.object({
  token: z.string().min(1, "Convite inválido."),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});
