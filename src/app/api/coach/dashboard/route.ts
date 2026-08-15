import { NextResponse } from "next/server";

import { addDays, todayYmd, weekdayOf } from "@/lib/calendar";
import type { CalendarItemDto } from "@/lib/calendar";
import type { CoachDashboardDto, WaWaitingDto } from "@/lib/coach-dashboard";
import { calendarEvents, plans, students, whatsapp } from "@/server/dal";
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

  const [base, canWhatsapp, canCalendar] = await Promise.all([
    students.getCoachDashboard(ctx),
    plans.canUseWhatsapp(ctx),
    plans.canUseCalendar(ctx),
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

  // Agenda cards: today's items and the rest of this week (through Saturday).
  // Empty for a plan without the calendar capability. `getCalendar` returns the
  // merged list already sorted by date → time → title, so a filter keeps order.
  let todayEvents: CalendarItemDto[] = [];
  let weekEvents: CalendarItemDto[] = [];
  if (canCalendar) {
    const today = todayYmd();
    const weekEnd = addDays(today, 6 - weekdayOf(today));
    const { items } = await calendarEvents.getCalendar(ctx, {
      from: today,
      to: weekEnd,
    });
    todayEvents = items.filter((i) => i.date === today);
    weekEvents = items.filter((i) => i.date > today);
  }

  const dashboard: CoachDashboardDto = {
    ...base,
    waWaiting,
    todayEvents,
    weekEvents,
  };
  return NextResponse.json(dashboard);
});
