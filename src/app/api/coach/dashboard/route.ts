import { NextResponse } from "next/server";

import type { CoachDashboardDto } from "@/lib/coach-dashboard";
import { students } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Coach dashboard data. Read by the /coach page via TanStack Query. There is no
 * external input to validate (no params, no body), so the zod rule has nothing
 * to parse here; identity + tenant still come from the session, and the DAL
 * scopes every query to this clinic. Returns only the real, data-backed cards —
 * the mockup's not-yet-built sections render "em breve" client-side.
 */
export const GET = withRoute("coach.dashboard", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const dashboard: CoachDashboardDto = await students.getCoachDashboard(ctx);
  return NextResponse.json(dashboard);
});
