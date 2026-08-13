import { NextResponse } from "next/server";

import { plans, students } from "@/server/dal";
import { apiError, forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

type Params = { params: Promise<{ id: string }> };

/**
 * Permanently deletes a student — the destructive path for plans that can't
 * archive (Free/Solo). Irreversible: removes the student, its history and the
 * aluno's login. Tenant-scoped and coach-only. Plans that CAN archive
 * (Clínica/Enterprise) must archive instead, so this is refused for them.
 */
export const DELETE = withRoute<Params>(
  "students.hardDelete",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    if (await plans.canArchiveStudents(ctx)) {
      return apiError(
        "Seu plano arquiva alunos em vez de excluir. Use Arquivar.",
        403,
      );
    }

    const ok = await students.hardDeleteStudent(ctx, id);
    if (!ok) return notFound("Aluno não encontrado.");

    logger.warn("student.hard_deleted", { studentId: id, clinicId: ctx.clinicId });
    return NextResponse.json({ ok: true });
  },
);
