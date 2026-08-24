import { and, asc, count, eq } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { User } from "@/db/schema";

/**
 * Platform admins (the admin accounts themselves).
 *
 * Cross-tenant by design (admins belong to no clinic) and admin-only. The
 * create side is an e-mailed invite (see the admin-invitations DAL); here we
 * list the activated admins and hard-delete one. Deleting an admin only ever
 * cascades their own session + account rows — an admin owns no clinic (the
 * bootstrap hook never gives them one) and no clinic-scoped data.
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

/** An activated platform admin, for the admin listing. */
export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

/** Every activated platform admin (`role = "admin"`), oldest first. */
export async function listAdmins(db: DB): Promise<AdminUserRow[]> {
  return db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"))
    .orderBy(asc(schema.user.createdAt));
}

/** How many activated platform admins exist. Used to block the last deletion. */
export async function countAdmins(db: DB): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));
  return total;
}

/** A single user by id, or null. */
export async function getUserById(db: DB, id: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return row ?? null;
}

/** A single user by e-mail (case-insensitive), or null — the duplicate guard. */
export async function getUserByEmail(
  db: DB,
  email: string,
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email.trim().toLowerCase()));
  return row ?? null;
}

/**
 * Hard-deletes a platform admin's account. Scoped to `role = "admin"`, so this
 * can never remove a coach or aluno. Deleting the user row cascades their
 * `session` and `account` rows (both FK `onDelete: cascade`); admins own no
 * clinic or clinic-scoped data, so nothing else is touched. Returns whether a
 * row was removed. Guard rails (self / last-admin / bootstrap) live at the route.
 */
export async function deleteAdminUser(db: DB, userId: string): Promise<boolean> {
  const rows = await db
    .delete(schema.user)
    .where(and(eq(schema.user.id, userId), eq(schema.user.role, "admin")))
    .returning({ id: schema.user.id });
  return rows.length > 0;
}

export type DeleteAdminResult = "deleted" | "last_admin" | "not_found";

/**
 * Atomically deletes an admin while enforcing the "never remove the last admin"
 * floor. The count and the delete run in ONE transaction with the admin rows
 * locked (`SELECT … FOR UPDATE`), so two concurrent deletes can't both read
 * "2 admins" and each drop one — the TOCTOU race the route's separate
 * count-then-delete had. Identity guards (self / bootstrap admin) stay at the
 * route; this only guarantees the last-admin invariant.
 */
export async function deleteAdminAtomic(
  db: DB,
  userId: string,
): Promise<DeleteAdminResult> {
  return db.transaction(async (tx) => {
    const admins = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, "admin"))
      .for("update");
    if (!admins.some((a) => a.id === userId)) return "not_found";
    if (admins.length <= 1) return "last_admin";
    await tx
      .delete(schema.user)
      .where(and(eq(schema.user.id, userId), eq(schema.user.role, "admin")));
    return "deleted";
  });
}
