import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminAiOverviewDto } from "@/lib/ai-programs";
import { isLlmConfigured } from "@/lib/llm-provider";
import { ai } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Platform-admin AI overview: per-tenant generations vs. allowance, token mix,
 * cache hit rate and cost for the current São Paulo month, plus the KPI totals.
 * Admin-only and cross-tenant (guarded by `getAdminSession`, not a
 * TenantContext) — same shape as the WhatsApp overview.
 *
 * `configured` rides along because an all-zero table is ambiguous otherwise:
 * nobody generated anything, or the feature was never switched on.
 */
export const GET = withRoute("admin.ai.overview", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const overview = await ai.getAdminAiOverview(db);
  return NextResponse.json({
    configured: isLlmConfigured(),
    ...overview,
  } satisfies AdminAiOverviewDto);
});
