import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";

import { type DB, schema } from "@/db";
import type {
  Exercise,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLevel,
  Muscle,
} from "@/db/schema";
import type {
  ExerciseSubstituteRow,
  ExerciseWriteInput,
} from "@/server/dal/exercises";

/**
 * Platform-admin exercise catalog (cross-tenant browse — admin only).
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

export type AdminExerciseOrigin = "base" | "clinic";

/** A row in the admin's cross-clinic exercise listing. */
export type AdminExerciseListItem = {
  id: string;
  code: string | null;
  name: string;
  category: ExerciseCategory;
  level: ExerciseLevel;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  archived: boolean;
  thumbnail: string | null;
};

export type AdminExerciseListParams = {
  search?: string;
  category?: ExerciseCategory;
  level?: ExerciseLevel;
  equipment?: ExerciseEquipment;
  muscle?: Muscle;
  origin?: AdminExerciseOrigin;
  clinicId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type AdminExerciseListResult = {
  items: AdminExerciseListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** Shared WHERE for the admin exercise listing (no tenant scope — admin sees all). */
function adminExerciseWhere(params: AdminExerciseListParams) {
  const conds: SQL[] = [];
  if (!params.includeArchived) conds.push(eq(schema.exercise.archived, false));
  if (params.category) conds.push(eq(schema.exercise.category, params.category));
  if (params.level) conds.push(eq(schema.exercise.level, params.level));
  if (params.equipment) {
    conds.push(eq(schema.exercise.equipment, params.equipment));
  }
  if (params.muscle) {
    conds.push(
      sql`(${params.muscle} = any(${schema.exercise.primaryMuscles})
        or ${params.muscle} = any(${schema.exercise.secondaryMuscles}))`,
    );
  }
  if (params.origin === "base") conds.push(isNull(schema.exercise.clinicId));
  if (params.origin === "clinic") conds.push(isNotNull(schema.exercise.clinicId));
  if (params.clinicId) conds.push(eq(schema.exercise.clinicId, params.clinicId));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`${schema.exercise.searchText} like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return conds.length ? and(...conds) : undefined;
}

/**
 * Every exercise on the platform (base + all clinics), filtered and paginated.
 * Cross-tenant by design — admin only. Each clinic exercise carries its clinic
 * name.
 */
export async function listAllExercises(
  db: DB,
  params: AdminExerciseListParams = {},
): Promise<AdminExerciseListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 24)));
  const where = adminExerciseWhere(params);
  const term = params.search?.trim();

  const orderBy = term
    ? [
        desc(sql`similarity(${schema.exercise.searchText}, unaccent(lower(${term})))`),
        asc(schema.exercise.name),
      ]
    : [asc(schema.exercise.name), asc(schema.exercise.id)];

  const rows = await db
    .select({
      id: schema.exercise.id,
      code: schema.exercise.code,
      name: schema.exercise.name,
      category: schema.exercise.category,
      level: schema.exercise.level,
      equipment: schema.exercise.equipment,
      primaryMuscles: schema.exercise.primaryMuscles,
      images: schema.exercise.images,
      archived: schema.exercise.archived,
      clinicId: schema.exercise.clinicId,
      clinicName: schema.clinic.name,
    })
    .from(schema.exercise)
    .leftJoin(schema.clinic, eq(schema.exercise.clinicId, schema.clinic.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.exercise)
    .where(where);

  const items: AdminExerciseListItem[] = rows.map(
    ({ clinicId, clinicName, images, ...r }) => ({
      ...r,
      origin: clinicId === null ? "base" : "clinic",
      clinicName: clinicId === null ? null : clinicName,
      thumbnail: images[0] ?? null,
    }),
  );

  return { items, total, page, pageSize };
}

export type AdminExerciseDetail = Exercise & {
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  substitutes: ExerciseSubstituteRow[];
};

/**
 * Any single exercise (base or any clinic's), with its clinic name and its
 * **base** substitutions (the ones the admin manages). Cross-tenant — admin
 * only. Returns null when the id doesn't exist.
 */
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

  const substitute = schema.exercise;
  const subs = await db
    .select({
      id: schema.exerciseSubstitution.id,
      exerciseId: substitute.id,
      name: substitute.name,
      code: substitute.code,
      category: substitute.category,
      equipment: substitute.equipment,
      images: substitute.images,
      clinicId: substitute.clinicId,
    })
    .from(schema.exerciseSubstitution)
    .innerJoin(
      substitute,
      eq(schema.exerciseSubstitution.substituteExerciseId, substitute.id),
    )
    .where(
      and(
        eq(schema.exerciseSubstitution.exerciseId, id),
        isNull(schema.exerciseSubstitution.clinicId),
        eq(substitute.archived, false),
      ),
    )
    .orderBy(asc(substitute.name));

  return {
    ...row.exercise,
    origin: row.exercise.clinicId === null ? "base" : "clinic",
    clinicName: row.exercise.clinicId === null ? null : row.clinicName,
    substitutes: subs.map(({ clinicId, images, ...s }) => ({
      ...s,
      thumbnail: images[0] ?? null,
      origin: clinicId === null ? "base" : "clinic",
      removable: true, // every base rule is admin-removable
    })),
  };
}

/** Maps the write input to the base-exercise columns (tenant/searchText set below). */
function baseExerciseValues(input: ExerciseWriteInput) {
  return {
    name: input.name,
    description: input.description,
    searchText: sql`unaccent(lower(${input.name}))`,
    category: input.category,
    level: input.level,
    force: input.force,
    mechanic: input.mechanic,
    equipment: input.equipment,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    instructions: input.instructions,
    images: input.images,
  };
}

/** Creates a shared **base** exercise (`clinic_id NULL`, `source = "custom"`, no code). */
export async function createBaseExercise(
  db: DB,
  input: ExerciseWriteInput,
): Promise<Exercise> {
  const [row] = await db
    .insert(schema.exercise)
    .values({ clinicId: null, code: null, source: "custom", ...baseExerciseValues(input) })
    .returning();
  return row;
}

/**
 * Edits a shared **base** exercise. Scoped to `clinic_id IS NULL`, so a clinic's
 * own exercise is never touched (returns null — a 404 at the route).
 */
export async function updateBaseExercise(
  db: DB,
  id: string,
  input: ExerciseWriteInput,
): Promise<Exercise | null> {
  const [row] = await db
    .update(schema.exercise)
    .set({ ...baseExerciseValues(input), updatedAt: new Date() })
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)))
    .returning();
  return row ?? null;
}

/** Archives a shared **base** exercise (`clinic_id IS NULL` only). */
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

/**
 * Archives ANY exercise — base or a clinic's own. This is the one exception to
 * the "admin writes base only" rule: as a moderation action the platform admin
 * may retire any exercise from the catalog (editing a clinic exercise is still
 * off-limits — only archiving). Cross-tenant by design; admin only. Returns null
 * when the id doesn't exist.
 */
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

/**
 * Restores (unarchives) ANY exercise — base or a clinic's own — the moderation
 * counterpart of {@link archiveAnyExercise}. Cross-tenant; admin only. Returns
 * null when the id doesn't exist.
 */
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

/** Whether an exercise exists and is a shared **base** exercise (`clinic_id NULL`). */
async function baseExerciseExists(db: DB, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(and(eq(schema.exercise.id, id), isNull(schema.exercise.clinicId)));
  return Boolean(row);
}

export type AddBaseExerciseSubstitutionResult =
  | { ok: true; substitute: ExerciseSubstituteRow }
  | {
      ok: false;
      reason:
        | "exercise_not_found"
        | "substitute_not_found"
        | "same_exercise"
        | "duplicate";
    };

/**
 * Adds a shared **base** substitution rule (`clinic_id NULL`): the substitute
 * exercise may replace the exercise. Both the exercise and its substitute MUST
 * be base exercises — a base rule pointing at a clinic's own exercise would leak
 * that exercise to every tenant, so a non-base id is rejected as "not found".
 * Self-substitution and duplicates are rejected too.
 */
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
    .select({
      name: schema.exercise.name,
      code: schema.exercise.code,
      category: schema.exercise.category,
      equipment: schema.exercise.equipment,
      images: schema.exercise.images,
    })
    .from(schema.exercise)
    .where(eq(schema.exercise.id, substituteExerciseId));

  return {
    ok: true,
    substitute: {
      id: ins.id,
      exerciseId: substituteExerciseId,
      name: sub.name,
      code: sub.code,
      category: sub.category,
      equipment: sub.equipment,
      thumbnail: sub.images[0] ?? null,
      origin: "base",
      removable: true,
    },
  };
}

/** Removes a shared **base** exercise substitution rule (`clinic_id NULL` only). */
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
