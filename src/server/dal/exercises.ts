import { and, asc, count, eq, isNull, or } from "drizzle-orm";

import { schema } from "@/db";
import type { Exercise } from "@/db/schema";
import type {
  ExerciseDetailDto,
  ExerciseFormValues,
  ExerciseListResponse,
  ExerciseOrigin,
  ExerciseSubstituteDto,
} from "@/lib/exercises";
import {
  exerciseFacets,
  exerciseFilterConditions,
  exerciseListColumns,
  exerciseOrderBy,
  exerciseOriginCounts,
  exerciseValues,
  originOf,
  substituteColumns,
  type ExerciseFilters,
} from "@/server/dal/exercise-query";
import type { TenantContext } from "@/server/tenant";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

export type ExerciseListParams = ExerciseFilters & {
  page?: number;
  pageSize?: number;
};

function visibleTo(ctx: TenantContext) {
  return or(
    isNull(schema.exercise.clinicId),
    eq(schema.exercise.clinicId, ctx.clinicId),
  )!;
}

export async function listExercises(
  ctx: TenantContext,
  params: ExerciseListParams = {},
): Promise<ExerciseListResponse> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const scope = [visibleTo(ctx), eq(schema.exercise.archived, false)];
  const where = and(...scope, ...exerciseFilterConditions(params));

  const [rows, [{ total }], facets, counts] = await Promise.all([
    ctx.db
      .select(exerciseListColumns)
      .from(schema.exercise)
      .where(where)
      .orderBy(...exerciseOrderBy(params.search))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    ctx.db.select({ total: count() }).from(schema.exercise).where(where),
    exerciseFacets(ctx.db, scope, params),
    exerciseOriginCounts(ctx.db, scope),
  ]);

  return {
    items: rows.map(({ clinicId, ...r }) => ({ ...r, origin: originOf(clinicId) })),
    total,
    page,
    pageSize,
    facets,
    counts,
  };
}

export async function createExercise(
  ctx: TenantContext,
  input: ExerciseFormValues,
): Promise<Exercise> {
  const [row] = await ctx.db
    .insert(schema.exercise)
    .values({ clinicId: ctx.clinicId, code: null, source: "custom", ...exerciseValues(input) })
    .returning();
  return row;
}

export async function updateExercise(
  ctx: TenantContext,
  id: string,
  input: ExerciseFormValues,
): Promise<Exercise | null> {
  const [row] = await ctx.db
    .update(schema.exercise)
    .set({ ...exerciseValues(input), updatedAt: new Date() })
    .where(
      and(
        eq(schema.exercise.id, id),
        eq(schema.exercise.clinicId, ctx.clinicId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function archiveExercise(
  ctx: TenantContext,
  id: string,
): Promise<Exercise | null> {
  const [row] = await ctx.db
    .update(schema.exercise)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(
        eq(schema.exercise.id, id),
        eq(schema.exercise.clinicId, ctx.clinicId),
      ),
    )
    .returning();
  return row ?? null;
}

export type ExerciseDetail = Exercise & {
  origin: ExerciseOrigin;
  substitutes: ExerciseSubstituteDto[];
};

export async function getExercise(
  ctx: TenantContext,
  id: string,
): Promise<ExerciseDetail | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.exercise)
    .where(and(eq(schema.exercise.id, id), visibleTo(ctx)));
  if (!row) return null;

  const subs = await ctx.db
    .select({
      id: schema.exerciseSubstitution.id,
      ruleClinicId: schema.exerciseSubstitution.clinicId,
      ...substituteColumns,
    })
    .from(schema.exerciseSubstitution)
    .innerJoin(
      schema.exercise,
      eq(schema.exerciseSubstitution.substituteExerciseId, schema.exercise.id),
    )
    .where(
      and(
        eq(schema.exerciseSubstitution.exerciseId, id),
        or(
          isNull(schema.exerciseSubstitution.clinicId),
          eq(schema.exerciseSubstitution.clinicId, ctx.clinicId),
        ),
        eq(schema.exercise.archived, false),
      ),
    )
    .orderBy(asc(schema.exercise.name));

  return {
    ...row,
    origin: originOf(row.clinicId),
    substitutes: subs.map(({ clinicId, ruleClinicId, ...s }) => ({
      ...s,
      origin: originOf(clinicId),
      removable: ruleClinicId === ctx.clinicId,
    })),
  };
}

async function exerciseVisibleToClinic(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(and(eq(schema.exercise.id, id), visibleTo(ctx)));
  return Boolean(row);
}

export type AddExerciseSubstitutionResult =
  | { ok: true; substitute: ExerciseSubstituteDto }
  | {
      ok: false;
      reason:
        | "exercise_not_found"
        | "substitute_not_found"
        | "same_exercise"
        | "duplicate";
    };

export async function addExerciseSubstitution(
  ctx: TenantContext,
  exerciseId: string,
  substituteExerciseId: string,
): Promise<AddExerciseSubstitutionResult> {
  if (exerciseId === substituteExerciseId) {
    return { ok: false, reason: "same_exercise" };
  }
  if (!(await exerciseVisibleToClinic(ctx, exerciseId))) {
    return { ok: false, reason: "exercise_not_found" };
  }
  if (!(await exerciseVisibleToClinic(ctx, substituteExerciseId))) {
    return { ok: false, reason: "substitute_not_found" };
  }

  const [dupe] = await ctx.db
    .select({ id: schema.exerciseSubstitution.id })
    .from(schema.exerciseSubstitution)
    .where(
      and(
        eq(schema.exerciseSubstitution.clinicId, ctx.clinicId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        eq(schema.exerciseSubstitution.substituteExerciseId, substituteExerciseId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await ctx.db
    .insert(schema.exerciseSubstitution)
    .values({ clinicId: ctx.clinicId, exerciseId, substituteExerciseId })
    .returning({ id: schema.exerciseSubstitution.id });
  const [sub] = await ctx.db
    .select(substituteColumns)
    .from(schema.exercise)
    .where(eq(schema.exercise.id, substituteExerciseId));
  const { clinicId, ...rest } = sub;

  return {
    ok: true,
    substitute: { id: ins.id, ...rest, origin: originOf(clinicId), removable: true },
  };
}

export async function removeExerciseSubstitution(
  ctx: TenantContext,
  exerciseId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await ctx.db
    .delete(schema.exerciseSubstitution)
    .where(
      and(
        eq(schema.exerciseSubstitution.id, substitutionId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        eq(schema.exerciseSubstitution.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.exerciseSubstitution.id });
  return deleted.length > 0;
}

export function exerciseDetailDto(
  exercise: Exercise & { origin: ExerciseOrigin; substitutes: ExerciseSubstituteDto[] },
): ExerciseDetailDto {
  return {
    id: exercise.id,
    code: exercise.code,
    name: exercise.name,
    nameEn: exercise.nameEn,
    description: exercise.description,
    descriptionEn: exercise.descriptionEn,
    bodyPart: exercise.bodyPart,
    category: exercise.category,
    equipment: exercise.equipment,
    machineKind: exercise.machineKind,
    target: exercise.target,
    secondaryMuscles: exercise.secondaryMuscles,
    mapPrimary: exercise.mapPrimary,
    mapSecondary: exercise.mapSecondary,
    muscleWeights: exercise.muscleWeights,
    needs: exercise.needs,
    hold: exercise.hold,
    track: exercise.track,
    instructions: exercise.instructions,
    instructionsEn: exercise.instructionsEn,
    image: exercise.image,
    video: exercise.video,
    femaleImage: exercise.femaleImage,
    femaleVideo: exercise.femaleVideo,
    origin: exercise.origin,
    archived: exercise.archived,
    substitutes: exercise.substitutes,
  };
}
