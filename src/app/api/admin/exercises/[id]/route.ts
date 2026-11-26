import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminExerciseDetailDto } from "@/lib/admin";
import { exerciseFormSchema } from "@/lib/exercises";
import { admin, exercises } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

export const GET = withAdmin<Params>(
  "admin.exercises.detail",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await admin.getAnyExercise(db, id);
    if (!exercise) return notFound("Exercício não encontrado.");

    const dto: AdminExerciseDetailDto = {
      ...exercises.exerciseDetailDto(exercise),
      clinicName: exercise.clinicName,
    };
    return NextResponse.json(dto);
  },
);

export const PUT = withAdmin<Params>(
  "admin.exercises.update",
  async (request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = exerciseFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const exercise = await admin.updateBaseExercise(db, id, parsed.data);
    if (!exercise) {
      return notFound("Exercício não encontrado ou não editável.");
    }
    logger.info("admin.exercise.updated", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);

export const DELETE = withAdmin<Params>(
  "admin.exercises.archive",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await admin.archiveAnyExercise(db, id);
    if (!exercise) return notFound("Exercício não encontrado.");
    logger.info("admin.exercise.archived", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);

export const PATCH = withAdmin<Params>(
  "admin.exercises.unarchive",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await admin.unarchiveAnyExercise(db, id);
    if (!exercise) return notFound("Exercício não encontrado.");
    logger.info("admin.exercise.unarchived", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);
