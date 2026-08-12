import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Hard-deletes any clinic's workout (admin data maintenance). Student workouts
 * created from it keep their own versioned copy — only
 * `student_workout.source_workout_id` nulls (FK ON DELETE SET NULL). Admin-only.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Params>(
  "admin.workouts.delete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const ok = await admin.hardDeleteWorkout(db, id);
    if (!ok) return notFound("Treino não encontrado.");
    logger.info("admin.workout_deleted", { workoutId: id });
    return NextResponse.json({ ok: true });
  },
);
