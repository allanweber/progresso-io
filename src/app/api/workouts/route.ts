import { NextResponse } from "next/server";

import { workoutFormSchema, workoutListQuerySchema } from "@/lib/workouts";
import { workouts } from "@/server/dal";
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
 * Treinos (programas) listing for the coach. Read via TanStack Query with
 * server-side search / archived-filter / pagination. Tenant-scoped through the
 * DAL (base templates + this clinic's own); coach-only. Query validated with zod.
 */
export const GET = withRoute("workouts.list", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = workoutListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    includeArchived: p.get("includeArchived") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await workouts.listWorkouts(ctx, {
    search: q.search,
    includeArchived: q.includeArchived,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(result);
});

/**
 * Creates a clinic-owned workout with its whole tree of sessions/exercises. The
 * DAL stamps `clinicId`/`coachId` from the session. Coach-only.
 */
export const POST = withRoute("workouts.create", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = workoutFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await workouts.createWorkout(ctx, parsed.data);
  if (!result.ok) {
    return apiError("Um dos exercícios selecionados é inválido.", 422);
  }
  logger.info("workout.created", { workoutId: result.id });
  return NextResponse.json({ workout: { id: result.id } }, { status: 201 });
});
