import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Hard-delete a clinic — the whole tenant. Permanently removes the clinic and
 * everything scoped to it (students, invitations, diets, workouts, anamneses, the
 * clinic's own foods/exercises, notifications) plus its user accounts (coaches +
 * activated alunos) with their sessions and credentials. Irreversible and
 * cross-tenant, so it's admin-only. See {@link admin.hardDeleteClinic}.
 */
type Params = { params: Promise<{ id: string }> };

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
