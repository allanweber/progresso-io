import { NextResponse } from "next/server";

import type { ExerciseSubstituteDto } from "@/lib/exercises";
import { exerciseSubstitutionFormSchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Adds a clinic-owned substitution rule to an exercise: the chosen substitute
 * may replace this exercise. Coach-only; the DAL stamps `clinicId`, so it never
 * touches the shared base rules — a coach can add its own alternatives but can
 * never alter what was defined as base. Self-substitution and duplicates are
 * rejected.
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

export const POST = withRoute<Params>(
  "exercises.substitution.add",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = exerciseSubstitutionFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await exercises.addExerciseSubstitution(
      ctx,
      id,
      parsed.data.substituteExerciseId,
    );
    if (!result.ok) {
      const r = REASONS[result.reason];
      return apiError(r.message, r.status);
    }
    logger.info("exercise.substitution_added", {
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
