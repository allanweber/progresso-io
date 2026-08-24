import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Removes a shared **base** substitution rule from a food. Admin-only; the DAL
 * scopes the delete to `clinic_id IS NULL`, so a clinic's own rule is never
 * touched (a non-base id yields a 404).
 */
type Params = { params: Promise<{ id: string; subId: string }> };

export const DELETE = withAdmin<Params>(
  "admin.foods.substitution.remove",
  async (_request, _session, { params }) => {
    const { id, subId } = await params;
    if (!isUuid(id) || !isUuid(subId)) return notFound("Substituição não encontrada.");

    const removed = await admin.removeBaseSubstitution(db, id, subId);
    if (!removed) return notFound("Substituição não encontrada.");
    logger.info("admin.food.base_substitution_removed", {
      foodId: id,
      substitutionId: subId,
    });
    return NextResponse.json({ ok: true });
  },
);
