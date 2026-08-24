import { NextResponse } from "next/server";

import { todayYmd } from "@/lib/calendar";
import type { CalendarItemDto } from "@/lib/calendar";
import type { CoachDashboardDto, QueueItemDto } from "@/lib/coach-dashboard";
import { studentInitials } from "@/lib/students";
import { calendarEvents, plans, students, whatsapp } from "@/server/dal";
import { forbidden, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Coach dashboard data. Read by the /coach page via TanStack Query. There is no
 * external input to validate (no params, no body), so the zod rule has nothing
 * to parse here; identity + tenant still come from the session, and the DAL
 * scopes every query to this clinic.
 *
 * This route owns the *merge*: the DAL returns four tenant-scoped backlogs and
 * the queue is composed here, because WhatsApp lives in its own DAL and is
 * plan-gated. A Free clinic simply contributes no WhatsApp rows — the queue is
 * shorter, never locked.
 */

/** How many queue rows the client may receive. It shows a handful and expands. */
const QUEUE_LIMIT = 50;

/** A `YYYY-MM-DD` day as an ISO instant, so every wait sorts on one scale. */
function dayToIso(ymd: string): string {
  return `${ymd}T00:00:00.000Z`;
}

export const GET = withRoute("coach.dashboard", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const [base, canWhatsapp, canCalendar] = await Promise.all([
    students.getCoachDashboard(ctx),
    plans.canUseWhatsapp(ctx),
    plans.canUseCalendar(ctx),
  ]);

  const items: QueueItemDto[] = [];

  for (const c of base.pendingCheckins) {
    items.push({
      key: `checkin:${c.id}`,
      kind: "checkin",
      name: `${c.firstName} ${c.lastName}`,
      avatarSeed: c.studentId,
      initials: studentInitials(c.firstName, c.lastName),
      waitingSince: dayToIso(c.date),
      // Straight to the task, not the record.
      href: `/coach/students/${c.studentId}/feedback`,
      detail: c.weightKg != null ? `${c.weightKg} kg` : null,
    });
  }

  if (canWhatsapp) {
    for (const c of await whatsapp.listWaiting(ctx, QUEUE_LIMIT)) {
      items.push({
        key: `whatsapp:${c.id}`,
        kind: "whatsapp",
        name: c.name,
        avatarSeed: c.studentId ?? c.id,
        initials: c.initials,
        waitingSince: c.lastMessageAt ?? new Date().toISOString(),
        // The conversation itself, not the index it used to dead-end into.
        href: `/coach/whatsapp?c=${c.id}`,
        detail: c.lastMessagePreview,
      });
    }
  }

  for (const s of base.missingPlans) {
    const missing = [
      s.missingWorkout ? "treino" : null,
      s.missingDiet ? "dieta" : null,
    ].filter(Boolean);
    items.push({
      key: `missing-plan:${s.id}`,
      kind: "missing-plan",
      name: `${s.firstName} ${s.lastName}`,
      avatarSeed: s.id,
      initials: studentInitials(s.firstName, s.lastName),
      waitingSince: s.createdAt.toISOString(),
      href: `/coach/students/${s.id}`,
      detail: `sem ${missing.join(" e ")}`,
    });
  }

  for (const d of base.pendingDrafts) {
    items.push({
      key: `draft:${d.id}`,
      kind: "draft",
      name: `${d.firstName} ${d.lastName}`,
      avatarSeed: d.studentId,
      initials: studentInitials(d.firstName, d.lastName),
      waitingSince: d.updatedAt.toISOString(),
      href: `/coach/students/${d.studentId}/${d.kind === "diet" ? "diet" : "workout"}`,
      detail: d.kind === "diet" ? "dieta não publicada" : "treino não publicado",
    });
  }

  // One rule: the longest wait comes first. Ties fall back to a stable key so
  // the order never shuffles between refetches.
  items.sort(
    (a, b) =>
      a.waitingSince.localeCompare(b.waitingSince) || a.key.localeCompare(b.key),
  );

  // Agenda: today only. The week belongs to the calendar page.
  let todayEvents: CalendarItemDto[] = [];
  if (canCalendar) {
    const today = todayYmd();
    const { items: events } = await calendarEvents.getCalendar(ctx, {
      from: today,
      to: today,
    });
    todayEvents = events.filter((i) => i.date === today);
  }

  const dashboard: CoachDashboardDto = {
    activeCount: base.activeCount,
    queue: items.slice(0, QUEUE_LIMIT),
    queueTotal: items.length,
    todayEvents,
  };
  return NextResponse.json(dashboard);
});
