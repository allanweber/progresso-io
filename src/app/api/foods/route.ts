import { NextResponse } from "next/server";

import { foodFormSchema, foodListQuerySchema } from "@/lib/foods";
import { foods } from "@/server/dal";
import {
  apiError,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

/**
 * Alimentos listing for the Bibliotecas page. Read via TanStack Query with
 * server-side search / filter / pagination. Tenant-scoped through the DAL (base
 * catalog + this clinic's own foods); coach-only (alunos have no access, super
 * admin lands in phase 3). Query validated with zod.
 */
export const GET = withCoach("foods.list", async (request, ctx) => {
  const p = new URL(request.url).searchParams;
  const parsed = foodListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    group: p.get("group") || undefined,
    type: p.get("type") || undefined,
    // A bare/"true" flag means favorites-only; anything else leaves it unset.
    favorite: p.get("favorite") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
    sort: p.get("sort") || undefined,
    dir: p.get("dir") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await foods.listFoods(ctx, {
    search: q.search,
    groupSlug: q.group,
    type: q.type,
    favoritesOnly: q.favorite,
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    dir: q.dir,
  });
  return NextResponse.json(result);
});

/**
 * Creates a custom food for this clinic (the "enxuto" form). Coach-only; the
 * DAL stamps `clinicId` from the session, so the food is private to the clinic.
 */
export const POST = withCoach("foods.create", async (request, ctx) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = foodFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const food = await foods.createFood(ctx, parsed.data);
  if (!food) return apiError("Grupo de alimento inválido.", 422);
  logger.info("food.created", { foodId: food.id });
  return NextResponse.json({ food }, { status: 201 });
});
