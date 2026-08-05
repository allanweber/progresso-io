import { NextResponse } from "next/server";

import { foodListQuerySchema } from "@/lib/foods";
import { foods } from "@/server/dal";
import { forbidden, unauthorized, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Alimentos listing for the Bibliotecas page. Read via TanStack Query with
 * server-side search / filter / pagination. Tenant-scoped through the DAL (base
 * catalog + this clinic's own foods); coach-only in phase 1 (alunos have no
 * access, super admin lands in phase 3). Query validated with zod.
 */
export const GET = withRoute("foods.list", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = foodListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    group: p.get("group") || undefined,
    type: p.get("type") || undefined,
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
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    dir: q.dir,
  });
  return NextResponse.json(result);
});
