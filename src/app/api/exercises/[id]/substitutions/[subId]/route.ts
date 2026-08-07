import { NextResponse } from "next/server";

import { exercises } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Removes one of this clinic's own substitution rules from an exercise. Coach-
 * only; the DAL scopes the delete by `clinicId` and the main exercise, so base
 * rules and other clinics' rules are never touched (a non-own id yields a 404).
 */
type Params = { params: Promise<{ id: string; subId: string }> };

export const DELETE = withRoute<Params>(
  "exercises.substitution.remove",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, subId } = await params;
    if (!isUuid(id) || !isUuid(subId)) {
      return notFound("Substituição não encontrada.");
    }

    const removed = await exercises.removeExerciseSubstitution(ctx, id, subId);
    if (!removed) return notFound("Substituição não encontrada.");
    logger.info("exercise.substitution_removed", {
      exerciseId: id,
      substitutionId: subId,
    });
    return NextResponse.json({ ok: true });
  },
);
