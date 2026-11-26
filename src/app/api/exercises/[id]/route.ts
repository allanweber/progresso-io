import { NextResponse } from "next/server";

import { exerciseFormSchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

export const GET = withCoach<Params>(
  "exercises.detail",
  async (_request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await exercises.getExercise(ctx, id);
    if (!exercise) return notFound("Exercício não encontrado.");

    return NextResponse.json(exercises.exerciseDetailDto(exercise));
  },
);

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
