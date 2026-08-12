import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  type AdminPlanLimitDto,
  PLAN_ORDER,
  planDisplayName,
} from "@/lib/admin";
import { admin } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Per-plan capability limits (`plan_limit`) — admin-managed reference data:
 * max alunos, max coaches, and whether WhatsApp is included. Admin-only
 * (getAdminSession), cross-tenant. GET returns every plan in display order,
 * filling any unseeded plan with unlimited/enabled defaults.
 */
export const GET = withRoute("admin.planLimits.list", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const rows = await admin.listPlanLimits(db);
  const byPlan = new Map(rows.map((r) => [r.plan, r]));

  const plans: AdminPlanLimitDto[] = PLAN_ORDER.map((plan) => {
    const r = byPlan.get(plan);
    return {
      plan,
      planName: planDisplayName(plan),
      maxStudents: r?.maxStudents ?? null,
      maxCoaches: r?.maxCoaches ?? null,
      whatsapp: r?.whatsapp ?? true,
    };
  });

  return NextResponse.json({ plans });
});
