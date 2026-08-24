import { NextResponse } from "next/server";

import { foods } from "@/server/dal";
import {
  isUuid,
  notFound,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/** Removes one of this clinic's own measures from a food. Coach-only. */
type Params = { params: Promise<{ id: string; measureId: string }> };

export const DELETE = withCoach<Params>(
  "foods.measure.remove",
  async (_request, ctx, { params }) => {
    const { id, measureId } = await params;
    if (!isUuid(id) || !isUuid(measureId)) return notFound("Medida não encontrada.");

    const ok = await foods.removeMeasure(ctx, id, measureId);
    if (!ok) return notFound("Medida não encontrada ou não editável.");
    logger.info("food.measure_removed", { foodId: id, measureId });
    return NextResponse.json({ ok: true });
  },
);
