import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminExerciseDetailDto } from "@/lib/admin";
import { exerciseFormSchema } from "@/lib/exercises";
import { admin } from "@/server/dal";
import {
  forbidden,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Any single exercise (base or any clinic's), for the super admin. Admin-only;
 * cross-tenant and read-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>(
  "admin.exercises.detail",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await admin.getAnyExercise(db, id);
    if (!exercise) return notFound("Exercício não encontrado.");

    const dto: AdminExerciseDetailDto = {
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
      clinicName: exercise.clinicName,
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
 * Edits a shared **base** exercise. Admin-only; the DAL scopes the write to
 * `clinic_id IS NULL`, so a clinic's own exercise is read-only here (a 404).
 */
export const PUT = withRoute<Params>(
  "admin.exercises.update",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

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

/** Archives a shared **base** exercise (base rows only). Admin-only. */
export const DELETE = withRoute<Params>(
  "admin.exercises.archive",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Exercício não encontrado.");

    const exercise = await admin.archiveBaseExercise(db, id);
    if (!exercise) {
      return notFound("Exercício não encontrado ou não editável.");
    }
    logger.info("admin.exercise.archived", { exerciseId: id });
    return NextResponse.json({ exercise });
  },
);
