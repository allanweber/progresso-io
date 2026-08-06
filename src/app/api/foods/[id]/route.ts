import { NextResponse } from "next/server";

import { foodFormSchema, type FoodDetailDto } from "@/lib/foods";
import { foods } from "@/server/dal";
import {
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
 * A single food: read the detail (identity, full per-100 g profile, visible
 * substitutes), edit or archive it. Editing/archiving only ever touches the
 * clinic's own custom foods — base TACO foods are read-only (the DAL scopes the
 * write by `clinicId`, so a base/other-clinic id yields a 404). Coach-only.
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
    isFavorite: food.isFavorite,
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
      removable: s.removable,
    })),
  };
  return NextResponse.json(dto);
});

export const PUT = withRoute<Params>("foods.update", async (request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = foodFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const food = await foods.updateFood(ctx, id, parsed.data);
  // null = not this clinic's own food (a base or other-clinic id) → 404.
  if (!food) return notFound("Alimento não encontrado ou não editável.");
  logger.info("food.updated", { foodId: id });
  return NextResponse.json({ food });
});

export const DELETE = withRoute<Params>("foods.archive", async (_request, { params }) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const food = await foods.archiveFood(ctx, id);
  if (!food) return notFound("Alimento não encontrado ou não editável.");
  logger.info("food.archived", { foodId: id });
  return NextResponse.json({ food });
});
