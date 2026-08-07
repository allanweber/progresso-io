import { NextResponse } from "next/server";

import { db } from "@/db";
import type { AdminFoodDetailDto } from "@/lib/admin";
import { foodFormSchema } from "@/lib/foods";
import { admin } from "@/server/dal";
import {
  forbidden,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * A single food for the admin: read any food (base or a clinic's), edit or
 * archive a **base** food. Editing/archiving is scoped to `clinic_id IS NULL`
 * in the DAL, so a clinic's own food is view-only (a clinic id yields a 404).
 * Admin-only.
 */
type Params = { params: Promise<{ id: string }> };

export const GET = withRoute<Params>("admin.foods.detail", async (_request, { params }) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const food = await admin.getAnyFood(db, id);
  if (!food) return notFound("Alimento não encontrado.");

  const dto: AdminFoodDetailDto = {
    id: food.id,
    code: food.code,
    description: food.description,
    type: food.type,
    groupName: food.groupName,
    groupSlug: food.groupSlug,
    origin: food.origin,
    clinicName: food.clinicName,
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
    measures: food.measures.map((m) => ({
      id: m.id,
      label: m.label,
      grams: m.grams,
      isDefault: m.isDefault,
      origin: m.origin,
      removable: m.removable,
    })),
  };
  return NextResponse.json(dto);
});

export const PUT = withRoute<Params>("admin.foods.updateBase", async (request, { params }) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = foodFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const food = await admin.updateBaseFood(db, id, parsed.data);
  // null = not a base food (a clinic's own, or unknown id) → 404.
  if (!food) return notFound("Alimento base não encontrado ou não editável.");
  logger.info("admin.food.base_updated", { foodId: id });
  return NextResponse.json({ food });
});

export const DELETE = withRoute<Params>("admin.foods.archiveBase", async (_request, { params }) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const food = await admin.archiveBaseFood(db, id);
  if (!food) return notFound("Alimento base não encontrado ou não editável.");
  logger.info("admin.food.base_archived", { foodId: id });
  return NextResponse.json({ food });
});

/**
 * Restores (unarchives) a **base** food. Admin-only; scoped to `clinic_id IS
 * NULL` like the archive, so a clinic's own food is never touched (404).
 */
export const PATCH = withRoute<Params>("admin.foods.unarchiveBase", async (_request, { params }) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const { id } = await params;
  if (!isUuid(id)) return notFound("Alimento não encontrado.");

  const food = await admin.unarchiveBaseFood(db, id);
  if (!food) return notFound("Alimento base não encontrado ou não editável.");
  logger.info("admin.food.base_unarchived", { foodId: id });
  return NextResponse.json({ food });
});
