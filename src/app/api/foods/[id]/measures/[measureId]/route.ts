import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import {
  forbidden,
  isUuid,
  notFound,
  unauthorized,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/** Removes one of this clinic's own measures from a food. Coach-only. */
type Params = { params: Promise<{ id: string; measureId: string }> };

export const DELETE = withRoute<Params>(
  "foods.measure.remove",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id, measureId } = await params;
    if (!isUuid(id) || !isUuid(measureId)) return notFound("Medida não encontrada.");

    const ok = await foods.removeMeasure(ctx, id, measureId);
    if (!ok) return notFound("Medida não encontrada ou não editável.");
    logger.info("food.measure_removed", { foodId: id, measureId });
    return NextResponse.json({ ok: true });
  },
);
