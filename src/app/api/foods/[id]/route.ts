import { NextResponse } from "next/server";

import type { FoodDetailDto } from "@/lib/foods";
import { foods } from "@/server/dal";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * A single food's detail: identity, full per-100 g nutrient profile, and the
 * substitutes visible to this clinic. Read-only in phase 1. Tenant-scoped
 * through the DAL (a base food or one of this clinic's own); coach-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>("foods.detail", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const food = await foods.getFood(ctx, id);
  if (!food) return notFound("Alimento não encontrado.");

  // Shape a client DTO — never leak internal columns (search_text, ids, dates).
  const dto: FoodDetailDto = {
    id: food.id,
    code: food.code,
    description: food.description,
    type: food.type,
    groupName: food.groupName,
    groupSlug: food.groupSlug,
    origin: food.origin,
    archived: food.archived,
    energyKcal: food.energyKcal,
    protein: food.protein,
    carbohydrate: food.carbohydrate,
    fat: food.fat,
    fiber: food.fiber,
    sodium: food.sodium,
    nutrients: food.nutrients.map((n) => ({
      id: n.id,
      label: n.label,
      unit: n.unit,
      kind: n.kind,
      value: n.value,
      isTrace: n.isTrace,
    })),
    substitutes: food.substitutes.map((s) => ({
      id: s.id,
      foodId: s.foodId,
      description: s.description,
      code: s.code,
      grams: s.grams,
      origin: s.origin,
    })),
  };
  return NextResponse.json(dto);
});
