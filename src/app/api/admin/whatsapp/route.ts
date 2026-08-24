import { NextResponse } from "next/server";

import { db } from "@/db";
import { whatsapp } from "@/server/dal";
import { withAdmin } from "@/server/guard";

/**
 * Platform-admin WhatsApp overview: per-tenant connection status + display
 * number, messages this month, and open 24h windows, plus the KPI totals.
 * Admin-only, cross-tenant (guarded by `getAdminSession`, not a TenantContext).
 */
export const GET = withAdmin("admin.whatsapp.overview", async () => {
  const overview = await whatsapp.getAdminOverview(db);
  return NextResponse.json(overview);
});
