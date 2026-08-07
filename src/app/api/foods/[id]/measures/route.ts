import { NextResponse } from "next/server";

import { measureFormSchema } from "@/lib/foods";
import { foods } from "@/server/dal";
import {
  apiError,
  forbidden,
  isUuid,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Adds a clinic-owned household measure to a food (any food the clinic can see).
 * Coach-only; the DAL stamps `clinicId`, so base measures are never touched.
 */
type Params = { params: Promise<{ id: string }> };

export const POST = withRoute<Params>(
  "foods.measure.add",
  async (request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

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
