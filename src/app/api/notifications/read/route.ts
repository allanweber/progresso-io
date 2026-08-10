import { NextResponse } from "next/server";

import { z } from "@/lib/validation";
import { notifications } from "@/server/dal";
import { forbidden, readJson, unauthorized, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Marks notifications read for the current coach — specific ids, or all of the
 * clinic's when no ids are given (the bell marks everything read on open).
 * Returns the refreshed unread count. Coach-only, tenant-scoped.
 */
const readBodySchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
});

export const POST = withRoute("notifications.markRead", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  // An empty body is allowed (mark all).
  const body = await readJson(request);
  const parsed = readBodySchema.safeParse(body.ok ? body.data : {});
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.ids && parsed.data.ids.length > 0) {
    await notifications.markRead(ctx, parsed.data.ids);
  } else {
    await notifications.markAllRead(ctx);
  }

  return NextResponse.json({ ok: true, unread: await notifications.unreadCount(ctx) });
});
