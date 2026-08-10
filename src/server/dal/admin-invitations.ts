import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { AdminInvitation } from "@/db/schema";

/**
 * Admin-invitation DAL — the invite that lets a NEW platform admin activate
 * their account by setting a password. Parallels the student `invitations` DAL,
 * but an admin belongs to no clinic and is not a student, so the invite carries
 * only the invitee's name + e-mail. The raw token is e-mailed and never stored —
 * only its SHA-256 hash lives in the database. These helpers take a raw {@link DB}
 * handle (admins are cross-tenant); every mutating caller is gated by
 * `getAdminSession()` at the route, and the accept-side lookup runs without a
 * session (the token itself is the authorization), like invite-accept.
 */

/** How long an admin invite stays valid. */
export const ADMIN_INVITE_TTL_DAYS = 7;

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
 * Creates an admin invite for an e-mail and returns the raw token (for the
 * e-mail link). Any earlier unaccepted invite for the same e-mail is superseded
 * so only one is ever live.
 */
export async function createAdminInvitation(
  db: DB,
  input: { email: string; name: string; invitedByUserId: string | null },
): Promise<{ invitation: AdminInvitation; rawToken: string }> {
  const email = input.email.trim().toLowerCase();

  // Supersede outstanding (unaccepted) invites for this e-mail.
  await db
    .delete(schema.adminInvitation)
    .where(
      and(
        eq(schema.adminInvitation.email, email),
        isNull(schema.adminInvitation.acceptedAt),
      ),
    );

  const { raw, hash } = generateToken();
  const expiresAt = new Date(
    Date.now() + ADMIN_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const [invitation] = await db
    .insert(schema.adminInvitation)
    .values({
      email,
      name: input.name.trim(),
      tokenHash: hash,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
    })
    .returning();

  return { invitation, rawToken: raw };
}

/** Whether an unaccepted, unexpired admin invite exists for this e-mail. */
export async function hasPendingInvite(db: DB, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.adminInvitation.id })
    .from(schema.adminInvitation)
    .where(
      and(
        eq(schema.adminInvitation.email, email.trim().toLowerCase()),
        isNull(schema.adminInvitation.acceptedAt),
        gt(schema.adminInvitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Every still-pending (unaccepted, unexpired) admin invite, newest first. */
export async function listPendingInvites(db: DB): Promise<AdminInvitation[]> {
  return db
    .select()
    .from(schema.adminInvitation)
    .where(
      and(
        isNull(schema.adminInvitation.acceptedAt),
        gt(schema.adminInvitation.expiresAt, new Date()),
      ),
    )
    .orderBy(schema.adminInvitation.createdAt);
}

/** A single pending invite by id (unaccepted, unexpired), or null. */
export async function getPendingInvite(
  db: DB,
  id: string,
): Promise<AdminInvitation | null> {
  const [row] = await db
    .select()
    .from(schema.adminInvitation)
    .where(
      and(
        eq(schema.adminInvitation.id, id),
        isNull(schema.adminInvitation.acceptedAt),
        gt(schema.adminInvitation.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/**
 * Resolves a raw token to its still-valid, unaccepted invite. Returns null when
 * the token is unknown, already accepted, or expired. No session — the accept
 * flow has none yet; the token is the credential.
 */
export async function findPendingByToken(
  db: DB,
  rawToken: string,
): Promise<AdminInvitation | null> {
  const [row] = await db
    .select()
    .from(schema.adminInvitation)
    .where(
      and(
        eq(schema.adminInvitation.tokenHash, hashToken(rawToken)),
        isNull(schema.adminInvitation.acceptedAt),
        gt(schema.adminInvitation.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}

/** Marks an admin invite accepted (idempotent within the accept transaction). */
export async function markAccepted(db: DB, invitationId: string): Promise<void> {
  await db
    .update(schema.adminInvitation)
    .set({ acceptedAt: new Date() })
    .where(eq(schema.adminInvitation.id, invitationId));
}

/** Deletes a pending invite (the "revoke" action). Returns whether a row went. */
export async function revokeInvite(db: DB, id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.adminInvitation)
    .where(
      and(
        eq(schema.adminInvitation.id, id),
        isNull(schema.adminInvitation.acceptedAt),
      ),
    )
    .returning({ id: schema.adminInvitation.id });
  return rows.length > 0;
}
