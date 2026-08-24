import { NextResponse } from "next/server";

import { forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getPlanUsage } from "@/server/plan-usage";
import { getTenantContext } from "@/server/tenant";

/**
 * The clinic's plan usage vs. its caps — roster alunos, coaches, whether
 * WhatsApp is included, the trial window, and any invoice still owed. Read by
 * the "Plano atual" settings card, the roster capacity chip, the dashboard KPI
 * and the billing banner. Counts + limits are derived from the session's
 * clinic, never client input.
 *
 * The composition itself lives in `@/server/plan-usage` because the coach
 * layout calls it directly to seed this query's `initialData`.
 */
export const GET = withRoute("coach.planUsage.read", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const usage = await getPlanUsage(ctx);
  if (!usage) return notFound("Clínica não encontrada.");
  return NextResponse.json(usage);
});
