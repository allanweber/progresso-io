import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminAiOverviewDto } from "@/lib/ai-programs";
import { isLlmConfigured } from "@/lib/llm-provider";
import { ai, aiSettings } from "@/server/dal";
import { withAdmin } from "@/server/guard";

/**
 * Platform-admin AI overview: per-tenant generations vs. allowance, token mix,
 * cache hit rate and cost for the current São Paulo month, plus the KPI totals.
 * Admin-only and cross-tenant (guarded by `getAdminSession`, not a
 * TenantContext) — same shape as the WhatsApp overview.
 *
 * `configured` rides along because an all-zero table is ambiguous otherwise:
 * nobody generated anything, or the feature was never switched on. `settings`
 * rides along for the same reason one level up — a cost that moved and a model
 * someone changed are indistinguishable in the numbers alone — and doubles as
 * the source of truth for the form that edits them.
 *
 * Neither carries a secret: `LLM_API_KEY` is never part of the response, only
 * whether one is set.
 */
export const GET = withAdmin("admin.ai.overview", async () => {
  const [overview, settings] = await Promise.all([
    ai.getAdminAiOverview(db),
    aiSettings.getAiSettings(db),
  ]);
  return NextResponse.json({
    configured: isLlmConfigured(),
    settings,
    ...overview,
  } satisfies AdminAiOverviewDto);
});
