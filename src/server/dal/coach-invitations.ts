import { createHash, randomBytes } from "node:crypto";

import { and, count, eq, gt, isNull } from "drizzle-orm";

import { type Database, type DB, schema } from "@/db";
import type { Clinic, CoachInvitation } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Coach-invitation DAL — the invite that lets a NEW coach join a clinic (the
 * `Clínica` plan's multi-coach team). Parallels the admin-invitation DAL, but a
 * coach belongs to a clinic, so the invite is clinic-scoped (writes go through
 * `ctx.clinicId`). The raw token is e-mailed and never stored — only its SHA-256
 * hash lives in the database. The accept-side lookup runs without a session (the
 * token itself is the authorization), like invite-accept.
 */

/** How long a coach invite stays valid. */
export const COACH_INVITE_TTL_DAYS = 7;

/** SHA-256 of a raw token, hex-encoded. The stored form. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** A fresh random token and its stored hash. */
function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/**
 * Creates a coach invite for an e-mail in the current clinic and returns the raw
 * token (for the e-mail link). Any earlier unaccepted invite for the same
 * (clinic, e-mail) is superseded so only one is ever live.
 */
export async function createCoachInvitation(
  ctx: TenantContext,
  input: { email: string; name: string },
): Promise<{ invitation: CoachInvitation; rawToken: string }> {
  const email = input.email.trim().toLowerCase();

  await ctx.db
    .delete(schema.coachInvitation)
    .where(
      and(
        eq(schema.coachInvitation.clinicId, ctx.clinicId),
        eq(schema.coachInvitation.email, email),
        isNull(schema.coachInvitation.acceptedAt),
      ),
    );

  const { raw, hash } = generateToken();
  const expiresAt = new Date(
    Date.now() + COACH_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const [invitation] = await ctx.db
    .insert(schema.coachInvitation)
    .values({
      clinicId: ctx.clinicId,
      email,
      name: input.name.trim(),
      tokenHash: hash,
      invitedByUserId: ctx.userId,
      expiresAt,
    })
    .returning();

  return { invitation, rawToken: raw };
}

/** Whether an unaccepted, unexpired coach invite exists for this clinic + e-mail. */
export async function hasPendingInvite(
  ctx: TenantContext,
  email: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.coachInvitation.id })
    .from(schema.coachInvitation)
    .where(
      and(
        eq(schema.coachInvitation.clinicId, ctx.clinicId),
        eq(schema.coachInvitation.email, email.trim().toLowerCase()),
        isNull(schema.coachInvitation.acceptedAt),
        gt(schema.coachInvitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Every still-pending (unaccepted, unexpired) coach invite for the clinic. */
export async function listPendingInvites(
  ctx: TenantContext,
): Promise<CoachInvitation[]> {
  return ctx.db
    .select()
    .from(schema.coachInvitation)
    .where(
      and(
        eq(schema.coachInvitation.clinicId, ctx.clinicId),
        isNull(schema.coachInvitation.acceptedAt),
        gt(schema.coachInvitation.expiresAt, new Date()),
      ),
    )
    .orderBy(schema.coachInvitation.createdAt);
}

/** Count of still-pending coach invites — each reserves a seat against the cap. */
export async function countPendingInvites(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count(schema.coachInvitation.id) })
    .from(schema.coachInvitation)
    .where(
      and(
        eq(schema.coachInvitation.clinicId, ctx.clinicId),
        isNull(schema.coachInvitation.acceptedAt),
        gt(schema.coachInvitation.expiresAt, new Date()),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Resolves a raw token to its still-valid, unaccepted invite and the clinic it
 * joins. Returns null when the token is unknown, already accepted, or expired.
 * No tenant context — the accept flow has no session yet; the token is the
 * credential.
 */
export async function findPendingByToken(
  db: DB,
  rawToken: string,
): Promise<{ invitation: CoachInvitation; clinic: Clinic } | null> {
  const [row] = await db
    .select({ invitation: schema.coachInvitation, clinic: schema.clinic })
    .from(schema.coachInvitation)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.coachInvitation.clinicId))
    .where(
      and(
        eq(schema.coachInvitation.tokenHash, hashToken(rawToken)),
        isNull(schema.coachInvitation.acceptedAt),
        gt(schema.coachInvitation.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/** Marks a coach invite accepted (idempotent within the accept transaction). */
export async function markAccepted(
  db: Database,
  invitationId: string,
): Promise<void> {
  await db
    .update(schema.coachInvitation)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.coachInvitation.id, invitationId));
}

/** Deletes a pending invite (the "cancelar convite" action), scoped to the clinic. */
export async function revokeInvite(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .delete(schema.coachInvitation)
    .where(
      and(
        eq(schema.coachInvitation.id, id),
        eq(schema.coachInvitation.clinicId, ctx.clinicId),
        isNull(schema.coachInvitation.acceptedAt),
      ),
    )
    .returning({ id: schema.coachInvitation.id });
  return rows.length > 0;
}
