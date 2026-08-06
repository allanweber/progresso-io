import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Removes one of this clinic's own substitution rules from a food. Coach-only;
 * the DAL scopes the delete by `clinicId` and the main food, so base rules and
 * other clinics' rules are never touched (a non-own id yields a 404).
 */
type Params = { params: Promise<{ id: string; subId: string }> };

export const DELETE = withRoute<Params>(
  "foods.substitution.remove",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, subId } = await params;
    if (!isUuid(id) || !isUuid(subId)) return notFound("Substituição não encontrada.");

    const removed = await foods.removeSubstitution(ctx, id, subId);
    if (!removed) return notFound("Substituição não encontrada.");
    logger.info("food.substitution_removed", { foodId: id, substitutionId: subId });
    return NextResponse.json({ ok: true });
  },
);
