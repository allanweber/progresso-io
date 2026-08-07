import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminExerciseDetailDto } from "@/lib/admin";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { withRoute } from "@/server/observability";
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
