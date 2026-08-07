import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Removes a shared **base** substitution rule from an exercise. Admin-only; the
 * DAL scopes the delete to `clinic_id IS NULL`, so a clinic's own rule is never
 * touched (a non-base id yields a 404).
 */
type Params = { params: Promise<{ id: string; subId: string }> };

export const DELETE = withRoute<Params>(
  "admin.exercises.substitution.remove",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id, subId } = await params;
    if (!isUuid(id) || !isUuid(subId)) {
      return notFound("Substituição não encontrada.");
    }

    const removed = await admin.removeBaseExerciseSubstitution(db, id, subId);
    if (!removed) return notFound("Substituição não encontrada.");
    logger.info("admin.exercise.base_substitution_removed", {
      exerciseId: id,
      substitutionId: subId,
    });
    return NextResponse.json({ ok: true });
  },
);
