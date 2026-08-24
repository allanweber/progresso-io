import { NextResponse } from "next/server";

import { db } from "@/db";
import { substitutionFormSchema } from "@/lib/foods";
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
 * Adds a shared **base** substitution rule to a food (`clinic_id NULL`): `grams`
 * of the chosen substitute replace 100 g of the food. Admin-only; both foods may
 * be any food on the platform. Self-substitution and duplicates are rejected.
 */
type Params = { params: Promise<{ id: string }> };

const REASONS: Record<string, { message: string; status: number }> = {
  same_food: { message: "Um alimento não pode substituir a si mesmo.", status: 422 },
  food_not_found: { message: "Alimento não encontrado.", status: 404 },
  substitute_not_found: { message: "Alimento substituto não encontrado.", status: 422 },
  duplicate: { message: "Este substituto já está cadastrado.", status: 409 },
};

export const POST = withAdmin<Params>(
  "admin.foods.substitution.add",
  async (request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Alimento não encontrado.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = substitutionFormSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const result = await admin.addBaseSubstitution(
      db,
      id,
      parsed.data.substituteFoodId,
      parsed.data.grams,
    );
    if (!result.ok) {
      const r = REASONS[result.reason];
      return apiError(r.message, r.status);
    }
    logger.info("admin.food.base_substitution_added", {
      foodId: id,
      substituteFoodId: parsed.data.substituteFoodId,
    });
    return NextResponse.json({ substitute: result.substitute }, { status: 201 });
  },
);
