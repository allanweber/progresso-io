import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Hard-delete a student. Unlike the coach's DELETE (which soft-archives), this
 * permanently removes the student and everything tied to it — invitations, and
 * the aluno's login with its sessions and accounts (see
 * {@link admin.hardDeleteStudent}). Irreversible, so it's admin-only.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Params>(
  "admin.students.hardDelete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const result = await admin.hardDeleteStudent(db, id);
    if (!result.deleted) return notFound("Aluno não encontrado.");

    // Irreversible + cross-tenant: worth an explicit audit line at warn level.
    logger.warn("student.hard_deleted", {
      studentId: id,
      deletedUser: result.deletedUser,
    });
    return NextResponse.json({ ok: true, deletedUser: result.deletedUser });
  },
);
