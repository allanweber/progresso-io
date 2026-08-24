import { NextResponse } from "next/server";

import { substitutionFormSchema } from "@/lib/foods";
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
 * Adds a clinic-owned substitution rule to a food: `grams` of the chosen
 * substitute replace 100 g of the main food. Coach-only; the DAL stamps
 * `clinicId`, validates that both foods are visible to the clinic, and rejects
 * self-substitution and duplicates.
 */
type Params = { params: Promise<{ id: string }> };

const REASONS: Record<string, { message: string; status: number }> = {
  same_food: { message: "Um alimento não pode substituir a si mesmo.", status: 422 },
  food_not_found: { message: "Alimento não encontrado.", status: 404 },
  substitute_not_found: { message: "Alimento substituto não encontrado.", status: 422 },
  duplicate: { message: "Este substituto já está cadastrado.", status: 409 },
};

export const POST = withCoach<Params>(
  "foods.substitution.add",
  async (request, ctx, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = substitutionFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await foods.addSubstitution(
      ctx,
      id,
      parsed.data.substituteFoodId,
      parsed.data.grams,
    );
    if (!result.ok) {
      const r = REASONS[result.reason];
      return apiError(r.message, r.status);
    }
    logger.info("food.substitution_added", {
      foodId: id,
      substituteFoodId: parsed.data.substituteFoodId,
    });
    return NextResponse.json({ substitute: result.substitute }, { status: 201 });
  },
);
