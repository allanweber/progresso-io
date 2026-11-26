import { and, count, eq, isNotNull, isNull, type SQL } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Exercise } from "@/db/schema";
import type { AdminExerciseListResponse } from "@/lib/admin";
import type {
  ExerciseFormValues,
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

export type AdminExerciseListParams = ExerciseFilters & {
  origin?: ExerciseOrigin;
  clinicId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

function adminScope(params: AdminExerciseListParams): SQL[] {
  const conds: SQL[] = [];
  if (!params.includeArchived) conds.push(eq(schema.exercise.archived, false));
  if (params.origin === "base") conds.push(isNull(schema.exercise.clinicId));
  if (params.origin === "clinic") conds.push(isNotNull(schema.exercise.clinicId));
  if (params.clinicId) conds.push(eq(schema.exercise.clinicId, params.clinicId));
  return conds;
}

export async function listAllExercises(
  db: DB,
  params: AdminExerciseListParams = {},
): Promise<AdminExerciseListResponse> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 40)));
  const scope = adminScope(params);
  const where = and(...scope, ...exerciseFilterConditions(params));

  const [rows, [{ total }], facets, counts] = await Promise.all([
    db
      .select({
        ...exerciseListColumns,
        archived: schema.exercise.archived,
        clinicName: schema.clinic.name,
      })
      .from(schema.exercise)
      .leftJoin(schema.clinic, eq(schema.exercise.clinicId, schema.clinic.id))
      .where(where)
      .orderBy(...exerciseOrderBy(params.search))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(schema.exercise).where(where),
    exerciseFacets(db, scope, params),
    exerciseOriginCounts(db, scope),
  ]);

  return {
    items: rows.map(({ clinicId, clinicName, ...r }) => ({
      ...r,
      origin: originOf(clinicId),
      clinicName: clinicId === null ? null : clinicName,
    })),
    total,
    page,
    pageSize,
    facets,
    counts,
  };
}

export type AdminExerciseDetail = Exercise & {
  origin: ExerciseOrigin;
  clinicName: string | null;
  substitutes: ExerciseSubstituteDto[];
};

export async function getAnyExercise(
  db: DB,
  id: string,
): Promise<AdminExerciseDetail | null> {
  const [row] = await db
    .select({
      exercise: schema.exercise,
      clinicName: schema.clinic.name,
    })
    .from(schema.exercise)
    .leftJoin(schema.clinic, eq(schema.exercise.clinicId, schema.clinic.id))
    .where(eq(schema.exercise.id, id));
  if (!row) return null;

  const subs = await db
    .select({ id: schema.exerciseSubstitution.id, ...substituteColumns })
    .from(schema.exerciseSubstitution)
    .innerJoin(
      schema.exercise,
      eq(schema.exerciseSubstitution.substituteExerciseId, schema.exercise.id),
    )
    .where(
      and(
        eq(schema.exerciseSubstitution.exerciseId, id),
        isNull(schema.exerciseSubstitution.clinicId),
        eq(schema.exercise.archived, false),
      ),
    )
    .orderBy(schema.exercise.name);

  return {
    ...row.exercise,
    origin: originOf(row.exercise.clinicId),
    clinicName: row.exercise.clinicId === null ? null : row.clinicName,
    substitutes: subs.map(({ clinicId, ...s }) => ({
      ...s,
      origin: originOf(clinicId),
      removable: true,
    })),
  };
}

export async function createBaseExercise(
  db: DB,
  input: ExerciseFormValues,
): Promise<Exercise> {
  const [row] = await db
    .insert(schema.exercise)
    .values({ clinicId: null, code: null, source: "custom", ...exerciseValues(input) })
    .returning();
  return row;
}

export async function updateBaseExercise(
  db: DB,
  id: string,
  input: ExerciseFormValues,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ ...exerciseValues(input), updatedAt: new Date() })
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)))
    .returning();
  return row ?? null;
}

export async function archiveBaseExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)))
    .returning();
  return row ?? null;
}

export async function archiveAnyExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(schema.exercise.id, id))
    .returning();
  return row ?? null;
}

export async function unarchiveAnyExercise(
  db: DB,
  id: string,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ archived: false, updatedAt: new Date() })
    .where(eq(schema.exercise.id, id))
    .returning();
  return row ?? null;
}

async function baseExerciseExists(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)));
  return Boolean(row);
}

export type AddBaseExerciseSubstitutionResult =
  | { ok: true; substitute: ExerciseSubstituteDto }
  | {
      ok: false;
      reason:
        | "exercise_not_found"
        | "substitute_not_found"
        | "same_exercise"
        | "duplicate";
    };

export async function addBaseExerciseSubstitution(
  db: DB,
  exerciseId: string,
  substituteExerciseId: string,
): Promise<AddBaseExerciseSubstitutionResult> {
  if (exerciseId === substituteExerciseId) {
    return { ok: false, reason: "same_exercise" };
  }
  if (!(await baseExerciseExists(db, exerciseId))) {
    return { ok: false, reason: "exercise_not_found" };
  }
  if (!(await baseExerciseExists(db, substituteExerciseId))) {
    return { ok: false, reason: "substitute_not_found" };
  }
  const [dupe] = await db
    .select({ id: schema.exerciseSubstitution.id })
    .from(schema.exerciseSubstitution)
    .where(
      and(
        isNull(schema.exerciseSubstitution.clinicId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        eq(schema.exerciseSubstitution.substituteExerciseId, substituteExerciseId),
      ),
    );
  if (dupe) return { ok: false, reason: "duplicate" };

  const [ins] = await db
    .insert(schema.exerciseSubstitution)
    .values({ clinicId: null, exerciseId, substituteExerciseId })
    .returning({ id: schema.exerciseSubstitution.id });
  const [sub] = await db
    .select(substituteColumns)
    .from(schema.exercise)
    .where(eq(schema.exercise.id, substituteExerciseId));
  const { clinicId, ...rest } = sub;

  return {
    ok: true,
    substitute: { id: ins.id, ...rest, origin: originOf(clinicId), removable: true },
  };
}

export async function removeBaseExerciseSubstitution(
  db: DB,
  exerciseId: string,
  substitutionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.exerciseSubstitution)
    .where(
      and(
        eq(schema.exerciseSubstitution.id, substitutionId),
        eq(schema.exerciseSubstitution.exerciseId, exerciseId),
        isNull(schema.exerciseSubstitution.clinicId),
      ),
    )
    .returning({ id: schema.exerciseSubstitution.id });
  return deleted.length > 0;
}
