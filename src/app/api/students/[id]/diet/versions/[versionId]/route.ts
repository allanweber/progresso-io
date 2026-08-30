import { NextResponse } from "next/server";

import { studentDiets } from "@/server/dal";
import { withCoach } from "@/server/guard";
import { apiError, isUuid, notFound } from "@/server/api";

/**
 * A single published version of a student's diet.
 *
 * - GET    → the version's tree, for the read-only history view.
 * - DELETE → permanently removes that one version from the history.
 *
 * Coach-only; scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withCoach<Params>(
  "student-diet.version",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const version = await studentDiets.getStudentDietVersion(ctx, id, versionId);
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);

/**
 * Deletes one published version from the history — a mis-published plan, a
 * duplicated import, a diet the coach no longer wants on the aluno's record.
 * Irreversible.
 *
 * The aluno-visible version (the active diet's newest) is refused with a 409:
 * the student is following it, and removing it would change their diet without
 * a publish. Deleting the last version of an archived diet takes the empty diet
 * with it.
 */
export const DELETE = withCoach<Params>(
  "student-diet.version.delete",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const result = await studentDiets.deleteStudentDietVersion(
      ctx,
      id,
      versionId,
    );
    if (!result.ok) {
      if (result.reason === "current") {
        return apiError(
          "A versão atual da dieta do aluno não pode ser excluída. Publique outra versão ou arquive esta dieta antes.",
          409,
        );
      }
      return notFound("Versão não encontrada.");
    }
    return NextResponse.json({ ok: true, deletedDiet: result.deletedDiet });
  },
);
