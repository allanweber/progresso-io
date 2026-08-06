import { NextResponse } from "next/server";

import { exerciseListQuerySchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import { forbidden, unauthorized, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Exercise catalog listing for the coach's library. Read via TanStack Query with
 * server-side search / filter / pagination. Tenant-scoped through the DAL (open
 * base catalog + this clinic's own exercises); coach-only. Query validated with
 * zod.
 */
export const GET = withRoute("exercises.list", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = exerciseListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    category: p.get("category") || undefined,
    level: p.get("level") || undefined,
    equipment: p.get("equipment") || undefined,
    muscle: p.get("muscle") || undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await exercises.listExercises(ctx, {
    search: q.search,
    category: q.category,
    level: q.level,
    equipment: q.equipment,
    muscle: q.muscle,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(result);
});
