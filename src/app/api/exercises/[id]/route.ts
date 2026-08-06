import { NextResponse } from "next/server";

import type { ExerciseDetailDto } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single exercise the clinic can see (an open base exercise or one of its own).
 * Coach-only; the DAL scopes visibility by clinic, so another clinic's custom
 * exercise yields a 404.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "exercises.detail",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await exercises.getExercise(ctx, id);
    if (!exercise) return notFound("Exercício não encontrado.");

    // Shape a client DTO — never leak internal columns (search_text, dates, ids).
    const dto: ExerciseDetailDto = {
      id: exercise.id,
      code: exercise.code,
      name: exercise.name,
      category: exercise.category,
      level: exercise.level,
      force: exercise.force,
      mechanic: exercise.mechanic,
      equipment: exercise.equipment,
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      instructions: exercise.instructions,
      images: exercise.images,
      origin: exercise.origin,
      archived: exercise.archived,
      substitutes: exercise.substitutes.map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        name: s.name,
        code: s.code,
        category: s.category,
        equipment: s.equipment,
        thumbnail: s.thumbnail,
        origin: s.origin,
      })),
    };
    return NextResponse.json(dto);
  },
);
