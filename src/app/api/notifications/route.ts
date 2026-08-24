import { NextResponse } from "next/server";

import type { NotificationListResponse } from "@/lib/notifications";
import { notifications } from "@/server/dal";
import { withCoach } from "@/server/guard";

/**
 * The coach's notifications for the bell: the clinic's notifications (newest
 * first) with a per-coach read flag, plus this coach's unread count. Polled via
 * TanStack Query. Coach-only, tenant-scoped through the DAL.
 */
export const GET = withCoach("notifications.list", async (_request, ctx) => {
  const { items, unread } = await notifications.listNotifications(ctx);
  const body: NotificationListResponse = {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      data: n.data,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  };
  return NextResponse.json(body);
});
