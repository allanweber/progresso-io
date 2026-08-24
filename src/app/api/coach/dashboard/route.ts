import { NextResponse } from "next/server";

import { addDays, todayYmd, weekdayOf } from "@/lib/calendar";
import type { CalendarItemDto } from "@/lib/calendar";
import type {
  CoachDashboardDto,
  PendingDraftDto,
  WaWaitingDto,
} from "@/lib/coach-dashboard";
import { calendarEvents, plans, students, whatsapp } from "@/server/dal";
import { withCoach } from "@/server/guard";

/**
 * Coach dashboard data. Read by the /coach page via TanStack Query. There is no
 * external input to validate (no params, no body), so the zod rule has nothing
 * to parse here; identity + tenant still come from the session, and the DAL
 * scopes every query to this clinic.
 *
 * Each backlog ships as its own list rather than one merged queue, because each
 * has its own count in the KPI row and its own destination in the card below it.
 * The "WhatsApp aguardando" queue is populated only when the plan includes
 * WhatsApp (empty otherwise, so a Free clinic's card just shows nothing to
 * answer); the agenda cards likewise depend on the calendar capability.
 */
export const GET = withCoach("coach.dashboard", async (_request, ctx) => {
  const [base, rosterCount, canWhatsapp, canCalendar] = await Promise.all([
    students.getCoachDashboard(ctx),
    students.countStudents(ctx),
    plans.canUseWhatsapp(ctx),
    plans.canUseCalendar(ctx),
  ]);

  // `listWaiting` caps at 5 — the card shows a preview of the inbox, not the
  // inbox. The count therefore cannot come from that array: `countWaiting` is
  // the uncapped total, and it is the same query the sidebar badge reads, so the
  // two can no longer disagree on screen (the tile said 5 while the rail said 9+).
  const [waWaitingRows, waWaitingTotal] = canWhatsapp
    ? await Promise.all([whatsapp.listWaiting(ctx), whatsapp.countWaiting(ctx)])
    : [[], 0];
  const waWaiting: WaWaitingDto[] = waWaitingRows.map((c) => ({
    conversationId: c.id,
    studentId: c.studentId,
    name: c.name,
    initials: c.initials,
    preview: c.lastMessagePreview,
  }));

  // A `Date` does not survive JSON, so the wire carries an ISO instant and the
  // client formats it. The DAL already sorted these longest-untouched first.
  const pendingDrafts: PendingDraftDto[] = base.pendingDrafts.map((d) => ({
    id: d.id,
    studentId: d.studentId,
    firstName: d.firstName,
    lastName: d.lastName,
    kind: d.kind,
    updatedAt: d.updatedAt.toISOString(),
  }));

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
    activeCount: base.activeCount,
    rosterCount,
    // `createdAt` is a DAL-only sort key; the card does not render a join date.
    missingPlans: base.missingPlans.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      goal: s.goal,
      missingDiet: s.missingDiet,
      missingWorkout: s.missingWorkout,
    })),
    pendingCheckins: base.pendingCheckins,
    waWaiting,
    pendingDrafts,
    todayEvents,
    weekEvents,
    totals: { ...base.totals, waWaiting: waWaitingTotal },
  };
  return NextResponse.json(dashboard);
});
