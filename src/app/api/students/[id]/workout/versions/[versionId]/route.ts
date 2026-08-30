import { NextResponse } from "next/server";

import { studentWorkouts } from "@/server/dal";
import { apiError, isUuid, notFound } from "@/server/api";
import { withCoach } from "@/server/guard";

/**
 * A single published version of a student's workout.
 *
 * - GET    → the version's sessions, for the read-only history view.
 * - DELETE → permanently removes that one version from the history.
 *
 * Coach-only; scoped by `clinicId` + `studentId`.
 */
type Params = { params: Promise<{ id: string; versionId: string }> };

export const GET = withCoach<Params>(
  "student-workout.version",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const version = await studentWorkouts.getStudentWorkoutVersion(
      ctx,
      id,
      versionId,
    );
    if (!version) return notFound("Versão não encontrada.");
    return NextResponse.json(version);
  },
);

/**
 * Deletes one published version from the history — a mis-published program, a
 * duplicated import, a treino the coach no longer wants on the aluno's record.
 * Irreversible.
 *
 * The aluno-visible version (the active workout's newest) is refused with a
 * 409: the student is training it. Deleting the last version of an archived
 * workout takes the empty workout with it.
 */
export const DELETE = withCoach<Params>(
  "student-workout.version.delete",
  async (_request, ctx, { params }) => {
    const { id, versionId } = await params;
    if (!isUuid(id) || !isUuid(versionId)) {
      return notFound("Versão não encontrada.");
    }

    const result = await studentWorkouts.deleteStudentWorkoutVersion(
      ctx,
      id,
      versionId,
    );
    if (!result.ok) {
      if (result.reason === "current") {
        return apiError(
          "A versão atual do treino do aluno não pode ser excluída. Publique outra versão ou arquive este treino antes.",
          409,
        );
      }
      return notFound("Versão não encontrada.");
    }
    return NextResponse.json({
      ok: true,
      deletedWorkout: result.deletedWorkout,
    });
  },
);
