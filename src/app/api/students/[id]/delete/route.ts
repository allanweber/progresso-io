import { NextResponse } from "next/server";

import { plans, students } from "@/server/dal";
import { apiError, isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * Permanently deletes a student — the destructive path for plans that can't
 * archive (Free/Solo). Irreversible: removes the student, its history and the
 * aluno's login. Tenant-scoped and coach-only. Plans that CAN archive
 * (Clínica/Enterprise) must archive instead, so this is refused for them.
 */
export const DELETE = withCoach<Params>(
  "students.hardDelete",
  async (_request, ctx, { params }) => {
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
