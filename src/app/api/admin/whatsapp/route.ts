import { NextResponse } from "next/server";

import { db } from "@/db";
import { whatsapp } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Platform-admin WhatsApp overview: per-tenant connection status + display
 * number, messages this month, and open 24h windows, plus the KPI totals.
 * Admin-only, cross-tenant (guarded by `getAdminSession`, not a TenantContext).
 */
export const GET = withRoute("admin.whatsapp.overview", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const overview = await whatsapp.getAdminOverview(db);
  return NextResponse.json(overview);
});
