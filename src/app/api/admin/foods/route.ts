import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminFoodListQuerySchema } from "@/lib/admin";
import { foodFormSchema } from "@/lib/foods";
import { admin } from "@/server/dal";
import { apiError, forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Platform-wide food catalog for the super admin. GET lists EVERY food (shared
 * base + all clinics' custom), filterable by search / group / type / origin /
 * clinic; POST creates a shared **base** food. Admin-only (gated by
 * {@link getAdminSession}); the DAL is cross-tenant but only ever writes base
 * rows. Input validated with zod.
 */
export const GET = withRoute("admin.foods.list", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = adminFoodListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    group: p.get("group") || undefined,
    type: p.get("type") || undefined,
    origin: p.get("origin") || undefined,
    clinic: p.get("clinic") || undefined,
    archived: p.get("archived") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
    sort: p.get("sort") || undefined,
    dir: p.get("dir") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await admin.listAllFoods(db, {
    search: q.search,
    groupSlug: q.group,
    type: q.type,
    origin: q.origin,
    clinicId: q.clinic,
    includeArchived: q.archived,
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    dir: q.dir,
  });
  return NextResponse.json(result);
});

export const POST = withRoute("admin.foods.createBase", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = foodFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const food = await admin.createBaseFood(db, parsed.data);
  if (!food) return apiError("Grupo de alimento inválido.", 422);
  logger.info("admin.food.base_created", { foodId: food.id });
  return NextResponse.json({ food }, { status: 201 });
});
