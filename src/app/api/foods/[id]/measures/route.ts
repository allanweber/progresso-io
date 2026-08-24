import { NextResponse } from "next/server";

import { measureFormSchema } from "@/lib/foods";
import { foods } from "@/server/dal";
import {
  apiError,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Adds a clinic-owned household measure to a food (any food the clinic can see).
 * Coach-only; the DAL stamps `clinicId`, so base measures are never touched.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withCoach<Params>(
  "foods.measure.add",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = measureFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const measure = await foods.addMeasure(ctx, id, parsed.data);
    if (!measure) return apiError("Alimento não encontrado.", 404);
    logger.info("food.measure_added", { foodId: id, measureId: measure.id });
    return NextResponse.json({ measure }, { status: 201 });
  },
);
