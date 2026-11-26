import { NextResponse } from "next/server";

import { exerciseSubstitutionFormSchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

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

export const POST = withCoach<Params>(
  "exercises.substitution.add",
  async (request, ctx, { params }) => {
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
    return NextResponse.json({ substitute: result.substitute }, { status: 201 });
  },
);
