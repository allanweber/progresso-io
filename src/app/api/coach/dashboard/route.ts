import { NextResponse } from "next/server";

import type { CoachDashboardDto, WaWaitingDto } from "@/lib/coach-dashboard";
import { plans, students, whatsapp } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Coach dashboard data. Read by the /coach page via TanStack Query. There is no
 * external input to validate (no params, no body), so the zod rule has nothing
 * to parse here; identity + tenant still come from the session, and the DAL
 * scopes every query to this clinic. Returns the real, data-backed cards — the
 * mockup's not-yet-built sections render "em breve" client-side. The "WhatsApp
 * aguardando" queue is populated only when the plan includes WhatsApp (empty
 * otherwise, so a Free clinic's card just shows nothing to answer).
 */
export const GET = withRoute("coach.dashboard", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const [base, canWhatsapp] = await Promise.all([
    students.getCoachDashboard(ctx),
    plans.canUseWhatsapp(ctx),
  ]);

  const waWaiting: WaWaitingDto[] = canWhatsapp
    ? (await whatsapp.listWaiting(ctx)).map((c) => ({
        conversationId: c.id,
        studentId: c.studentId,
        name: c.name,
        initials: c.initials,
        preview: c.lastMessagePreview,
      }))
    : [];

  const dashboard: CoachDashboardDto = { ...base, waWaiting };
  return NextResponse.json(dashboard);
});
