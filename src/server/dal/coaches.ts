import { and, count, eq, isNotNull, ne } from "drizzle-orm";

import { schema } from "@/db";
import type { TenantContext } from "@/server/tenant";

/**
 * Coach-team DAL. The `Clínica` plan lets several coaches share one clinic; this
 * module reads/manages the clinic's own coaches. Every query is scoped by
 * `ctx.clinicId` — a clinic can only ever see or touch its own coaches. Team
 * management is an owner concern: the callers gate mutations on
 * {@link isClinicOwner} at the route.
 */

/** A coach that belongs to the clinic, with derived team fields. */
export type ClinicCoach = {
  id: string;
  name: string;
  email: string;
  /** The clinic owner (`clinic.ownerUserId`) — protected from removal. */
  isOwner: boolean;
  /** Active (non-archived) students assigned to this coach. */
  studentCount: number;
};

/** The clinic's owner user id (the coach who created it). */
export async function getClinicOwnerId(ctx: TenantContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));
  return row?.ownerUserId ?? null;
}

/** Whether the current user owns the clinic (the only team-management role). */
export async function isClinicOwner(ctx: TenantContext): Promise<boolean> {
  return (await getClinicOwnerId(ctx)) === ctx.userId;
}

/**
 * Whether a login already exists for this e-mail (any clinic/role). An existence
 * check only — no data leaks. A coach belongs to exactly one clinic, so we
 * reject inviting an e-mail that already has an account.
 */
export async function isEmailRegistered(
  ctx: TenantContext,
  email: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email.trim().toLowerCase()))
    .limit(1);
  return Boolean(row);
}

/**
 * Every coach in the clinic (owner first, then by name), each with its count of
 * active assigned students. Two round-trips: the coach rows, then a grouped
 * count of non-archived students per `coachId`.
 */
export async function listClinicCoaches(ctx: TenantContext): Promise<ClinicCoach[]> {
  const [coaches, counts, ownerId] = await Promise.all([
    ctx.db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.clinicId, ctx.clinicId),
          eq(schema.user.role, "coach"),
        ),
      ),
    ctx.db
      .select({
        coachId: schema.students.coachId,
        n: count(schema.students.id),
      })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.clinicId, ctx.clinicId),
          ne(schema.students.status, "archived"),
          isNotNull(schema.students.coachId),
        ),
      )
      .groupBy(schema.students.coachId),
    getClinicOwnerId(ctx),
  ]);

  const byCoach = new Map(counts.map((c) => [c.coachId, c.n]));

  return coaches
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      isOwner: c.id === ownerId,
      studentCount: byCoach.get(c.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

/** Number of coaches currently in the clinic (owner included). */
export async function countActiveCoaches(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count(schema.user.id) })
    .from(schema.user)
    .where(
      and(eq(schema.user.clinicId, ctx.clinicId), eq(schema.user.role, "coach")),
    );
  return row?.n ?? 0;
}

export type RemoveCoachResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "is_owner" | "is_self" };

/**
 * Removes a coach from the clinic: transfers all their alunos to the owner, then
 * hard-deletes the account (sessions/accounts cascade; any authored content has
 * its `coachId` nulled by the schema FKs). The owner and the acting user can't
 * be removed. Everything runs in one transaction so a mid-flow failure can't
 * leave alunos half-transferred.
 */
export async function removeCoach(
  ctx: TenantContext,
  coachUserId: string,
): Promise<RemoveCoachResult> {
  const ownerId = await getClinicOwnerId(ctx);
  if (!ownerId) return { ok: false, reason: "not_found" };
  if (coachUserId === ownerId) return { ok: false, reason: "is_owner" };
  if (coachUserId === ctx.userId) return { ok: false, reason: "is_self" };

  // The target must be a coach in THIS clinic (tenant scope + role guard).
  const [target] = await ctx.db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(
      and(
        eq(schema.user.id, coachUserId),
        eq(schema.user.clinicId, ctx.clinicId),
        eq(schema.user.role, "coach"),
      ),
    );
  if (!target) return { ok: false, reason: "not_found" };

  await ctx.db.transaction(async (tx) => {
    // Transfer this coach's alunos to the owner so none is left unassigned.
    await tx
      .update(schema.students)
      .set({ coachId: ownerId })
      .where(
        and(
          eq(schema.students.clinicId, ctx.clinicId),
          eq(schema.students.coachId, coachUserId),
        ),
      );
    // Hard-delete the account (login gone; content authorship nulled via FKs).
    await tx.delete(schema.user).where(eq(schema.user.id, coachUserId));
  });

  return { ok: true };
}
