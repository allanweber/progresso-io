import { NextResponse } from "next/server";

import { db } from "@/db";
import type { ExerciseSubstituteDto } from "@/lib/exercises";
import { exerciseSubstitutionFormSchema } from "@/lib/exercises";
import { admin } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Adds a shared **base** substitution rule to an exercise (`clinic_id NULL`):
 * the chosen substitute may replace this exercise. Admin-only. Both the exercise
 * and the substitute must be base exercises; self-substitution and duplicates
 * are rejected.
 */
type Params = { params: Promise<{ id: string }> };

const REASONS: Record<string, { message: string; status: number }> = {
  same_exercise: {
    message: "Um exercício não pode substituir a si mesmo.",
    status: 422,
  },
  exercise_not_found: { message: "Exercício não encontrado.", status: 404 },
  substitute_not_found: {
    message: "Exercício substituto não encontrado.",
    status: 422,
  },
  duplicate: { message: "Este substituto já está cadastrado.", status: 409 },
};

export const POST = withAdmin<Params>(
  "admin.exercises.substitution.add",
  async (request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = exerciseSubstitutionFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await admin.addBaseExerciseSubstitution(
      db,
      id,
      parsed.data.substituteExerciseId,
    );
    if (!result.ok) {
      const r = REASONS[result.reason];
      return apiError(r.message, r.status);
    }
    logger.info("admin.exercise.base_substitution_added", {
      exerciseId: id,
      substituteExerciseId: parsed.data.substituteExerciseId,
    });
    const substitute: ExerciseSubstituteDto = {
      id: result.substitute.id,
      exerciseId: result.substitute.exerciseId,
      name: result.substitute.name,
      code: result.substitute.code,
      category: result.substitute.category,
      equipment: result.substitute.equipment,
      thumbnail: result.substitute.thumbnail,
      origin: result.substitute.origin,
      removable: result.substitute.removable,
    };
    return NextResponse.json({ substitute }, { status: 201 });
  },
);
