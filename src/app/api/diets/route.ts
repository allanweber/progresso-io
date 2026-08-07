import { NextResponse } from "next/server";

import { dietFormSchema, dietListQuerySchema } from "@/lib/diets";
import { diets } from "@/server/dal";
import {
  apiError,
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Dietas listing for the coach. Read via TanStack Query with server-side search
 * / archived-filter / pagination. Tenant-scoped through the DAL (base templates +
 * this clinic's own diets); coach-only. Query validated with zod.
 */
export const GET = withRoute("diets.list", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = dietListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    includeArchived: p.get("includeArchived") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await diets.listDiets(ctx, {
    search: q.search,
    includeArchived: q.includeArchived,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(result);
});

/**
 * Creates a clinic-owned diet with its whole tree of meals/items/substitutes.
 * Coach-only; the DAL stamps `clinicId` (and `coachId`) from the session, so the
 * diet is private to the clinic.
 */
export const POST = withRoute("diets.create", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = dietFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await diets.createDiet(ctx, parsed.data);
  if (!result.ok) {
    return apiError("Um dos alimentos selecionados é inválido.", 422);
  }
  logger.info("diet.created", { dietId: result.id });
  return NextResponse.json({ diet: { id: result.id } }, { status: 201 });
});
