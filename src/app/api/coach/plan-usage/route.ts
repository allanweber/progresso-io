import { NextResponse } from "next/server";

import { PLAN_META, type PlanUsageDto } from "@/lib/plans";
import { clinics, coaches, plans, students } from "@/server/dal";
import { forbidden, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * The clinic's plan usage vs. its caps — active alunos, coaches, and whether
 * WhatsApp is included. Read by the "Plano atual" settings card, the roster
 * capacity chip and the dashboard KPI. Any coach in the clinic may read it;
 * counts + limits are derived from the session's clinic, never client input.
 */
export const GET = withRoute("coach.planUsage.read", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const [clinic, limits, studentCount, coachCount] = await Promise.all([
    clinics.getClinic(ctx),
    plans.getPlanLimits(ctx),
    students.countStudents(ctx),
    coaches.countActiveCoaches(ctx),
  ]);
  if (!clinic) return notFound("Clínica não encontrada.");

  return NextResponse.json({
    plan: clinic.plan,
    planName: PLAN_META[clinic.plan].name,
    students: { used: studentCount, limit: limits.maxStudents },
    coaches: { used: coachCount, limit: limits.maxCoaches },
    whatsapp: limits.whatsapp,
  } satisfies PlanUsageDto);
});
