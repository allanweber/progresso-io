import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Invitation, Student } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Invitations DAL. An invite lets a student activate their aluno login by
 * setting a password. The raw token is e-mailed and never stored — only its
 * SHA-256 hash lives in the database, so a leaked table can't be used to accept
 * invites. Tenant writes are scoped by `ctx.clinicId`; the accept-side lookup
 * runs without a session (the token itself is the authorization) and is the
 * documented bootstrap exception, mirroring clinic creation at sign-up.
 */

/** How long an invite stays valid. */
export const INVITE_TTL_DAYS = 7;

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
 * Creates an invite for a student in the current clinic and returns the raw
 * token (for the e-mail link) alongside the stored row. Any earlier unaccepted
 * invite for the same student is superseded so only one is ever live.
 */
export async function createInvitation(
  ctx: TenantContext,
  studentId: string,
): Promise<{ invitation: Invitation; rawToken: string }> {
  // Supersede outstanding invites for this student (scoped to the clinic).
  await ctx.db
    .delete(schema.invitation)
    .where(
      and(
        eq(schema.invitation.clinicId, ctx.clinicId),
        eq(schema.invitation.studentId, studentId),
        isNull(schema.invitation.acceptedAt),
      ),
    );

  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [invitation] = await ctx.db
    .insert(schema.invitation)
    .values({
      clinicId: ctx.clinicId,
      studentId,
      tokenHash: hash,
      expiresAt,
    })
    .returning();

  return { invitation, rawToken: raw };
}

/**
 * Resolves a raw token to its still-valid, unaccepted invite and the student it
 * belongs to. Returns null when the token is unknown, already accepted, or
 * expired. No tenant context: the accept flow has no session yet — the token is
 * the credential.
 */
export async function findPendingByToken(
  db: DB,
  rawToken: string,
): Promise<{ invitation: Invitation; student: Student } | null> {
  const [row] = await db
    .select({ invitation: schema.invitation, student: schema.students })
    .from(schema.invitation)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.invitation.studentId),
    )
    .where(
      and(
        eq(schema.invitation.tokenHash, hashToken(rawToken)),
        isNull(schema.invitation.acceptedAt),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/** Marks an invite as accepted (idempotent within the accept transaction). */
export async function markAccepted(db: DB, invitationId: string): Promise<void> {
  await db
    .update(schema.invitation)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.invitation.id, invitationId));
}
