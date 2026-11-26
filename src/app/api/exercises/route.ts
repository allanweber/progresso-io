import { NextResponse } from "next/server";

import { exerciseFormSchema, exerciseListQuerySchema } from "@/lib/exercises";
import { exercises } from "@/server/dal";
import {
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withCoach } from "@/server/guard";

export const GET = withCoach("exercises.list", async (request, ctx) => {
  const p = new URL(request.url).searchParams;
  const parsed = exerciseListQuerySchema.safeParse({
    search: p.get("search") || undefined,
    bodyPart: p.get("bodyPart") || undefined,
    category: p.get("category") || undefined,
    equipment: p.get("equipment") || undefined,
    target: p.get("target") || undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await exercises.listExercises(ctx, q);
  return NextResponse.json(result);
});

export const POST = withCoach("exercises.create", async (request, ctx) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = exerciseFormSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const exercise = await exercises.createExercise(ctx, parsed.data);
  logger.info("exercise.created", { exerciseId: exercise.id });
  return NextResponse.json({ exercise }, { status: 201 });
});
