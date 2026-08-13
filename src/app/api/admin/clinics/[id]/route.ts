import { NextResponse } from "next/server";

import { db } from "@/db";
import type { Plan } from "@/db/schema";
import type { AdminClinicLimitsDto } from "@/lib/admin";
import { PLAN_DEFAULT_ARCHIVE, PLAN_DEFAULT_CALENDAR, PLAN_META } from "@/lib/plans";
import { admin, billing } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/** Maps the DAL limits row into the client DTO (adds the plan display name). */
function toLimitsDto(
  plan: Plan,
  row: Awaited<ReturnType<typeof admin.getClinicLimits>>,
): AdminClinicLimitsDto {
  return {
    plan,
    planName: PLAN_META[plan]?.name ?? plan,
    planMaxStudents: row?.planMaxStudents ?? null,
    planMaxCoaches: row?.planMaxCoaches ?? null,
    planWhatsapp: row?.planWhatsapp ?? true,
    planArchive: row?.planArchive ?? PLAN_DEFAULT_ARCHIVE[plan],
    planCalendar: row?.planCalendar ?? PLAN_DEFAULT_CALENDAR[plan],
    maxStudentsOverride: row?.maxStudentsOverride ?? null,
    maxCoachesOverride: row?.maxCoachesOverride ?? null,
    whatsappOverride: row?.whatsappOverride ?? null,
    archiveOverride: row?.archiveOverride ?? null,
    calendarOverride: row?.calendarOverride ?? null,
  };
}

type Params = { params: Promise<{ id: string }> };

/**
 * The per-clinic admin detail payload: the clinic (identity + owner + counts +
 * current plan), its plan-change history (audit trail), and its invoices (the
 * manual billing ledger, with derived totals). Admin-only, cross-tenant.
 */
export const GET = withRoute<Params>(
  "admin.clinics.detail",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Clínica não encontrada.");

    const clinic = await admin.getClinicAdminRow(db, id);
    if (!clinic) return notFound("Clínica não encontrada.");

    const [planChanges, invoices, limitsRow] = await Promise.all([
      billing.listPlanChanges(db, id),
      billing.listInvoicesForClinic(db, id),
      admin.getClinicLimits(db, id),
    ]);
    const limits = toLimitsDto(clinic.plan, limitsRow);
    return NextResponse.json({ clinic, planChanges, invoices, limits });
  },
);

/**
 * Hard-delete a clinic — the whole tenant. Permanently removes the clinic and
 * everything scoped to it (students, invitations, diets, workouts, anamneses, the
 * clinic's own foods/exercises, notifications) plus its user accounts (coaches +
 * activated alunos) with their sessions and credentials. Irreversible and
 * cross-tenant, so it's admin-only. See {@link admin.hardDeleteClinic}.
 */

export const DELETE = withRoute<Params>(
  "admin.clinics.hardDelete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const result = await admin.hardDeleteClinic(db, id);
    if (!result.deleted) return notFound("Clínica não encontrada.");

    // Irreversible + tenant-wide: an explicit audit line at warn level.
    logger.warn("clinic.hard_deleted", {
      clinicId: id,
      deletedUsers: result.deletedUsers,
      by: session.user.id,
    });
    return NextResponse.json({ ok: true, deletedUsers: result.deletedUsers });
  },
);
