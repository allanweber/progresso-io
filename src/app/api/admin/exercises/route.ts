import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminExerciseListQuerySchema } from "@/lib/admin";
import { exerciseFormSchema } from "@/lib/exercises";
import { admin } from "@/server/dal";
import { forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Platform-wide exercise catalog for the super admin. Lists EVERY exercise
 * (shared base + all clinics' custom), filterable by search / category / level /
 * equipment / muscle / origin / clinic. Admin-only (gated by
 * {@link getAdminSession}); the DAL is cross-tenant and read-only here. Input
 * validated with zod.
 */
export const GET = withRoute("admin.exercises.list", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = adminExerciseListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    category: p.get("category") || undefined,
    level: p.get("level") || undefined,
    equipment: p.get("equipment") || undefined,
    muscle: p.get("muscle") || undefined,
    origin: p.get("origin") || undefined,
    clinic: p.get("clinic") || undefined,
    archived: p.get("archived") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await admin.listAllExercises(db, {
    search: q.search,
    category: q.category,
    level: q.level,
    equipment: q.equipment,
    muscle: q.muscle,
    origin: q.origin,
    clinicId: q.clinic,
    includeArchived: q.archived,
    page: q.page,
    pageSize: q.pageSize,
  });
  return NextResponse.json(result);
});

/**
 * Creates a shared **base** exercise (`clinic_id NULL`), visible to every
 * clinic. Admin-only (gated by {@link getAdminSession}); the DAL writes the base
 * row. Same zod validation as the coach create route.
 */
export const POST = withRoute("admin.exercises.create", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = exerciseFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const exercise = await admin.createBaseExercise(db, parsed.data);
  logger.info("admin.exercise.created", { exerciseId: exercise.id });
  return NextResponse.json({ exercise }, { status: 201 });
});
