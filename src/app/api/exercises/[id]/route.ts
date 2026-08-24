import { NextResponse } from "next/server";

import { exerciseFormSchema, type ExerciseDetailDto } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * A single exercise the clinic can see (an open base exercise or one of its own).
 * Coach-only; the DAL scopes visibility by clinic, so another clinic's custom
 * exercise yields a 404.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "exercises.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await exercises.getExercise(ctx, id);
    if (!exercise) return notFound("Exercício não encontrado.");

    // Shape a client DTO — never leak internal columns (search_text, dates, ids).
    const dto: ExerciseDetailDto = {
      id: exercise.id,
      code: exercise.code,
      name: exercise.name,
      description: exercise.description,
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
        removable: s.removable,
      })),
    };
    return NextResponse.json(dto);
  },
);

/**
 * Edits one of this clinic's own custom exercises. Coach-only; the DAL scopes
 * the write by `clinicId`, so a base or other-clinic id yields a 404. Input
 * validated with zod.
 */
export const PUT = withCoach<Params>(
  "exercises.update",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = exerciseFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const exercise = await exercises.updateExercise(ctx, id, parsed.data);
    if (!exercise) {
      return notFound("Exercício não encontrado ou não editável.");
    }
    logger.info("exercise.updated", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);

/** Archives one of this clinic's own custom exercises. Coach-only. */
export const DELETE = withCoach<Params>(
  "exercises.archive",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await exercises.archiveExercise(ctx, id);
    if (!exercise) {
      return notFound("Exercício não encontrado ou não editável.");
    }
    logger.info("exercise.archived", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);
