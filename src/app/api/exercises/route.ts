import { NextResponse } from "next/server";

import { exerciseFormSchema, exerciseListQuerySchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  forbidden,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
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

/**
 * Creates a custom exercise for this clinic. Coach-only; the DAL stamps
 * `clinicId` from the session, so the exercise is private to the clinic (never a
 * base row). Every field is validated with zod; images are R2 keys uploaded
 * beforehand via `POST /api/exercises/images`.
 */
export const POST = withRoute("exercises.create", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = exerciseFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const exercise = await exercises.createExercise(ctx, parsed.data);
  logger.info("exercise.created", { exerciseId: exercise.id });
  return NextResponse.json({ exercise }, { status: 201 });
});
