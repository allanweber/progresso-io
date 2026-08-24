import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/** Removes a shared **base** household measure from a food. Admin-only. */
type Params = { params: Promise<{ id: string; measureId: string }> };

export const DELETE = withAdmin<Params>(
  "admin.foods.measure.remove",
  async (_request, _session, { params }) => {
    const { id, measureId } = await params;
    if (!isUuid(id) || !isUuid(measureId)) return notFound("Medida não encontrada.");

    const ok = await admin.removeBaseMeasure(db, id, measureId);
    if (!ok) return notFound("Medida não encontrada.");
    logger.info("admin.food.base_measure_removed", { foodId: id, measureId });
    return NextResponse.json({ ok: true });
  },
);
