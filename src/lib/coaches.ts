import type { Plan } from "@/db/schema";
import { PLAN_META } from "@/lib/plans";
import { z } from "@/lib/validation";

/**
 * Client-safe coach-team domain: the invite zod schema, the DTOs the "Equipe de
 * coaches" settings card reads, and the pure seat-accounting helpers. Only erased
 * `import type`s from the schema, so it bundles into client code. A coach seat is
 * consumed by an accepted coach (owner included) OR a still-pending invite, so
 * the cap can never be over-committed.
 */

/** Owner invites a new coach by name + e-mail. */
export const coachInviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do coach.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido."),
});
export type CoachInviteInput = z.output<typeof coachInviteSchema>;

export type CoachRowDto = {
  id: string;
  name: string;
  initials: string;
  /** The clinic owner — shown as "Admin · Coach", protected from removal. */
  isOwner: boolean;
  studentCount: number;
};

export type PendingInviteDto = {
  id: string;
  name: string;
  email: string;
  initials: string;
};

export type ClinicTeamDto = {
  plan: Plan;
  /** Display name of the plan (e.g. "Clínica"). */
  planName: string;
  /** Max coaches for the plan. `null` = unlimited. */
  maxCoaches: number | null;
  /** Accepted coaches in the clinic (owner included) — the "ocupadas" count. */
  occupied: number;
  pendingCount: number;
  /** Accepted + pending — what the cap is measured against. */
  seatsUsed: number;
  /** Whether another invite may be sent right now. */
  canInvite: boolean;
  coaches: CoachRowDto[];
  pendingInvites: PendingInviteDto[];
};

/**
 * The `/api/coach/team` GET payload. `enabled: false` means the current user
 * isn't the owner or the plan has no team surface — the card simply isn't shown.
 */
export type CoachTeamResponse =
  | { enabled: false }
  | { enabled: true; team: ClinicTeamDto };

/** Two-letter initials from a full name ("Thiago Corrêa" → "TC"). */
export function coachInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Whether a clinic at `seatsUsed` seats may add another coach. */
export function canInviteCoach(
  seatsUsed: number,
  maxCoaches: number | null,
): boolean {
  return maxCoaches === null || seatsUsed < maxCoaches;
}

/**
 * Assembles the team DTO from raw rows. Pure (no DB) so the seat math is
 * unit-testable. `occupied` is the accepted coaches; each pending invite also
 * consumes a seat, so `seatsUsed = occupied + pending`.
 */
export function buildTeamDto(input: {
  plan: Plan;
  maxCoaches: number | null;
  coaches: { id: string; name: string; email: string; isOwner: boolean; studentCount: number }[];
  pendingInvites: { id: string; name: string; email: string }[];
}): ClinicTeamDto {
  const occupied = input.coaches.length;
  const pendingCount = input.pendingInvites.length;
  const seatsUsed = occupied + pendingCount;
  return {
    plan: input.plan,
    planName: PLAN_META[input.plan].name,
    maxCoaches: input.maxCoaches,
    occupied,
    pendingCount,
    seatsUsed,
    canInvite: canInviteCoach(seatsUsed, input.maxCoaches),
    coaches: input.coaches.map((c) => ({
      id: c.id,
      name: c.name,
      initials: coachInitials(c.name),
      isOwner: c.isOwner,
      studentCount: c.studentCount,
    })),
    pendingInvites: input.pendingInvites.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      initials: coachInitials(p.name),
    })),
  };
}

/**
 * Whether the plan supports a multi-coach team (the card only shows for the
 * owner on such plans). A single-seat plan (free/solo, `maxCoaches === 1`) has no
 * team surface; unlimited (`null`) or >1 does.
 */
export function planSupportsTeam(maxCoaches: number | null): boolean {
  return maxCoaches === null || maxCoaches > 1;
}
