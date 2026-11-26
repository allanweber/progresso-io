import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminExerciseListQuerySchema } from "@/lib/admin";
import { exerciseFormSchema } from "@/lib/exercises";
import { admin } from "@/server/dal";
import { readJson, validationError } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

export const GET = withAdmin("admin.exercises.list", async (request) => {
  const p = new URL(request.url).searchParams;
  const parsed = adminExerciseListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    bodyPart: p.get("bodyPart") || undefined,
    category: p.get("category") || undefined,
    equipment: p.get("equipment") || undefined,
    target: p.get("target") || undefined,
    origin: p.get("origin") || undefined,
    clinic: p.get("clinic") || undefined,
    archived: p.get("archived") === "true" ? true : undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const { clinic, archived, ...rest } = q;
  const result = await admin.listAllExercises(db, {
    ...rest,
    clinicId: clinic,
    includeArchived: archived,
  });
  return NextResponse.json(result);
});

export const POST = withAdmin("admin.exercises.create", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = exerciseFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const exercise = await admin.createBaseExercise(db, parsed.data);
  logger.info("admin.exercise.created", { exerciseId: exercise.id });
  return NextResponse.json({ exercise }, { status: 201 });
});
