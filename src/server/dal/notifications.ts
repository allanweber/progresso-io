import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { NotificationData, NotificationType } from "@/lib/notifications";
import type { TenantContext } from "@/server/tenant";

/**
 * Notifications DAL. Notifications are **clinic-scoped**: every coach in the
 * clinic sees them, and read-state is per coach (`notification_read`). Tenant
 * reads/writes are scoped by `ctx.clinicId`. `createNotification` is raised from
 * the public anamnese-submit flow (no session) so it takes a raw DB handle + an
 * explicit `clinicId` (resolved from the fill token, never from client input).
 */

const DEFAULT_LIMIT = 30;

export type NotificationRow = {
  id: string;
  type: NotificationType;
  data: NotificationData;
  read: boolean;
  createdAt: Date;
};

/** Raises a clinic notification. Called from the public submit flow. */
export async function createNotification(
  db: DB,
  input: { clinicId: string; type: NotificationType; data: NotificationData },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.notification)
    .values({
      clinicId: input.clinicId,
      type: input.type,
      data: input.data,
    })
    .returning({ id: schema.notification.id });
  return { id: row.id };
}

/**
 * A page of the clinic's notifications (newest first), each flagged read/unread
 * for the current coach, plus the coach's total unread count.
 */
export async function listNotifications(
  ctx: TenantContext,
  params: { limit?: number } = {},
): Promise<{ items: NotificationRow[]; unread: number }> {
  const limit = Math.min(100, Math.max(1, params.limit ?? DEFAULT_LIMIT));

  const rows = await ctx.db
    .select({
      id: schema.notification.id,
      type: schema.notification.type,
      data: schema.notification.data,
      createdAt: schema.notification.createdAt,
      readAt: schema.notificationRead.readAt,
    })
    .from(schema.notification)
    .leftJoin(
      schema.notificationRead,
      and(
        eq(schema.notificationRead.notificationId, schema.notification.id),
        eq(schema.notificationRead.userId, ctx.userId),
      ),
    )
    .where(eq(schema.notification.clinicId, ctx.clinicId))
    .orderBy(desc(schema.notification.createdAt))
    .limit(limit);

  const items: NotificationRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    data: r.data,
    read: r.readAt !== null,
    createdAt: r.createdAt,
  }));

  return { items, unread: await unreadCount(ctx) };
}

/** How many of the clinic's notifications this coach hasn't read yet. */
export async function unreadCount(ctx: TenantContext): Promise<number> {
  const [{ n }] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notification)
    .leftJoin(
      schema.notificationRead,
      and(
        eq(schema.notificationRead.notificationId, schema.notification.id),
        eq(schema.notificationRead.userId, ctx.userId),
      ),
    )
    .where(
      and(
        eq(schema.notification.clinicId, ctx.clinicId),
        sql`${schema.notificationRead.readAt} is null`,
      ),
    );
  return n ?? 0;
}

/** Marks specific notifications read for this coach (scoped to the clinic). */
export async function markRead(
  ctx: TenantContext,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;
  const rows = await ctx.db
    .select({ id: schema.notification.id })
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.clinicId, ctx.clinicId),
        inArray(schema.notification.id, notificationIds),
      ),
    );
  if (rows.length === 0) return;
  await ctx.db
    .insert(schema.notificationRead)
    .values(rows.map((r) => ({ notificationId: r.id, userId: ctx.userId })))
    .onConflictDoNothing();
}

/** Marks every one of the clinic's notifications read for this coach. */
export async function markAllRead(ctx: TenantContext): Promise<void> {
  await ctx.db.execute(sql`
    insert into notification_read (notification_id, user_id)
    select n.id, ${ctx.userId} from notification n
    where n.clinic_id = ${ctx.clinicId}
    on conflict do nothing
  `);
}
