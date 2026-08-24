import { NextResponse } from "next/server";

import { db } from "@/db";
import { measureFormSchema } from "@/lib/foods";
import { admin } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Adds a shared **base** household measure to a food (`clinic_id NULL`).
 * Admin-only; the food may be any food on the platform.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withAdmin<Params>(
  "admin.foods.measure.add",
  async (request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = measureFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const measure = await admin.addBaseMeasure(db, id, parsed.data);
    if (!measure) return apiError("Alimento não encontrado.", 404);
    logger.info("admin.food.base_measure_added", { foodId: id, measureId: measure.id });
    return NextResponse.json({ measure }, { status: 201 });
  },
);
