import { NextResponse } from "next/server";

import {
  PLAN_META,
  trialDaysLeft,
  type OpenInvoiceDto,
  type PlanUsageDto,
  type TrialDto,
} from "@/lib/plans";
import { billing, clinics, coaches, plans, students } from "@/server/dal";
import { forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The clinic's plan usage vs. its caps — active alunos, coaches, whether
 * WhatsApp is included, the trial window, and any invoice still owed. Read by
 * the "Plano atual" settings card, the roster capacity chip, the dashboard KPI
 * and the billing banner. Counts + limits are derived from the session's
 * clinic, never client input.
 */
export const GET = withRoute("coach.planUsage.read", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const [clinic, limits, studentCount, coachCount, invoices] = await Promise.all(
    [
      clinics.getClinic(ctx),
      plans.getPlanLimits(ctx),
      students.countStudents(ctx),
      coaches.countActiveCoaches(ctx),
      billing.listMyInvoices(ctx),
    ],
  );
  if (!clinic) return notFound("Clínica não encontrada.");

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

  // Oldest unpaid first, so the banner nags about the longest-overdue invoice
  // rather than whichever happens to sort first.
  const unpaid = invoices
    .filter((inv) => inv.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const openInvoice: OpenInvoiceDto | null = unpaid[0]
    ? {
        id: unpaid[0].id,
        number: unpaid[0].number,
        dueDate: unpaid[0].dueDate,
        totalCents: unpaid[0].totalCents,
        overdue: unpaid[0].overdue,
      }
    : null;

  return NextResponse.json({
    plan: limits.plan,
    planName: PLAN_META[limits.plan].name,
    effectivePlan: limits.effectivePlan,
    students: { used: studentCount, limit: limits.maxStudents },
    coaches: { used: coachCount, limit: limits.maxCoaches },
    whatsapp: limits.whatsapp,
    archive: limits.archive,
    trial,
    openInvoice,
  } satisfies PlanUsageDto);
});
