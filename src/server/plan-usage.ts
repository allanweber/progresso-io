import {
  PLAN_META,
  trialDaysLeft,
  type OpenInvoiceDto,
  type PlanUsageDto,
  type TrialDto,
} from "@/lib/plans";
import { ai, billing, clinics, coaches, plans, students } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

/**
 * The clinic's plan usage vs. its caps — roster and coach counts, whether
 * WhatsApp is included, the trial window, and any invoice still owed.
 *
 * Lives here rather than inside the route handler because two callers need it:
 * `GET /api/coach/plan-usage` (the settings card, the roster chip, the dashboard
 * tile) and the coach layout, which passes it to the shell as the query's
 * `initialData`. Without that, the billing banner and the dashboard's capacity
 * footnote both appeared one round-trip *after* first paint and shoved the page
 * down — twice, on a trial clinic, on the screen a coach opens most often.
 *
 * Every count is derived from the session's clinic via the DAL, never from
 * client input. Returns `null` when the clinic row is missing.
 */
export async function getPlanUsage(
  ctx: TenantContext,
): Promise<PlanUsageDto | null> {
  const [clinic, limits, studentCount, coachCount, openRow, aiUsed] =
    await Promise.all([
      clinics.getClinic(ctx),
      plans.getPlanLimits(ctx),
      students.countStudents(ctx),
      coaches.countActiveCoaches(ctx),
      billing.findOpenInvoice(ctx),
      ai.countGenerationsThisMonth(ctx),
    ]);
  if (!clinic) return null;

  const now = new Date();
  const daysLeft = limits.trialEndsAt
    ? trialDaysLeft(limits.trialEndsAt, now)
    : 0;
  const trial: TrialDto = {
    active: limits.trialActive,
    endsAt: limits.trialEndsAt?.toISOString() ?? null,
    daysLeft,
    // "Expired" only while the clinic is still on free: once it upgrades, the
    // spent trial is history and the banner has nothing to say about it.
    expired:
      limits.trialEndsAt !== null && !limits.trialActive && limits.plan === "free",
  };

  // The DAL already returns the oldest unpaid fatura (or null), so the banner
  // nags about the longest-overdue one without this layer re-sorting anything.
  const openInvoice: OpenInvoiceDto | null = openRow
    ? {
        id: openRow.id,
        number: openRow.number,
        dueDate: openRow.dueDate,
        totalCents: openRow.totalCents,
        overdue: openRow.overdue,
      }
    : null;

  return {
    plan: limits.plan,
    planName: PLAN_META[limits.plan].name,
    effectivePlan: limits.effectivePlan,
    students: { used: studentCount, limit: limits.maxStudents },
    coaches: { used: coachCount, limit: limits.maxCoaches },
    // Resets on the 1st (America/São_Paulo) — a count of rows, not live objects.
    ai: { used: aiUsed, limit: limits.aiGenerations },
    whatsapp: limits.whatsapp,
    archive: limits.archive,
    trial,
    openInvoice,
  };
}
