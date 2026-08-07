import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/** Removes a shared **base** household measure from a food. Admin-only. */
type Params = { params: Promise<{ id: string; measureId: string }> };

export const DELETE = withRoute<Params>(
  "admin.foods.measure.remove",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id, measureId } = await params;
    if (!isUuid(id) || !isUuid(measureId)) return notFound("Medida não encontrada.");

    const ok = await admin.removeBaseMeasure(db, id, measureId);
    if (!ok) return notFound("Medida não encontrada.");
    logger.info("admin.food.base_measure_removed", { foodId: id, measureId });
    return NextResponse.json({ ok: true });
  },
);
