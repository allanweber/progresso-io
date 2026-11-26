import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";

import { schema } from "@/db";
import {
  bodyMapOf,
  muscleWeightsFor,
  type ExerciseBodyPart,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseFacets,
  type ExerciseFormValues,
  type ExerciseOrigin,
  type ExerciseTarget,
} from "@/lib/exercises";
import {
  exerciseSearchConditions,
  exerciseSearchRank,
  exerciseSearchText,
} from "@/server/dal/exercise-search";
import type { TenantContext } from "@/server/tenant";

export type ExerciseFilters = {
  search?: string;
  bodyPart?: ExerciseBodyPart;
  category?: ExerciseCategory;
  equipment?: ExerciseEquipment;
  target?: ExerciseTarget;
};

export function exerciseFilterConditions(
  params: ExerciseFilters,
  skip: { category?: boolean; equipment?: boolean } = {},
): SQL[] {
  const conds: SQL[] = [];
  if (params.bodyPart) conds.push(eq(schema.exercise.bodyPart, params.bodyPart));
  if (params.category && !skip.category) {
    conds.push(eq(schema.exercise.category, params.category));
  }
  if (params.equipment && !skip.equipment) {
    conds.push(eq(schema.exercise.equipment, params.equipment));
  }
  if (params.target) conds.push(eq(schema.exercise.target, params.target));
  const term = params.search?.trim();
  if (term) conds.push(...exerciseSearchConditions(term));
  return conds;
}

export function exerciseOrderBy(search: string | undefined) {
  const term = search?.trim();
  const byPopularity = [
    desc(schema.exercise.popularity),
    asc(schema.exercise.name),
    asc(schema.exercise.id),
  ];
  return term
    ? [desc(sql`floor(${exerciseSearchRank(term)} * 10)`), ...byPopularity]
    : byPopularity;
}

export const exerciseListColumns = {
  id: schema.exercise.id,
  code: schema.exercise.code,
  name: schema.exercise.name,
  nameEn: schema.exercise.nameEn,
  bodyPart: schema.exercise.bodyPart,
  category: schema.exercise.category,
  equipment: schema.exercise.equipment,
  target: schema.exercise.target,
  image: schema.exercise.image,
  clinicId: schema.exercise.clinicId,
};

export const substituteColumns = {
  exerciseId: schema.exercise.id,
  name: schema.exercise.name,
  code: schema.exercise.code,
  category: schema.exercise.category,
  equipment: schema.exercise.equipment,
  image: schema.exercise.image,
  clinicId: schema.exercise.clinicId,
};

export function originOf(clinicId: string | null): ExerciseOrigin {
  return clinicId === null ? "base" : "clinic";
}

export async function exerciseFacets(
  db: TenantContext["db"],
  scope: SQL[],
  params: ExerciseFilters,
): Promise<ExerciseFacets> {
  const [categories, equipment] = await Promise.all([
    db
      .selectDistinct({ value: schema.exercise.category })
      .from(schema.exercise)
      .where(and(...scope, ...exerciseFilterConditions(params, { category: true }))),
    db
      .selectDistinct({ value: schema.exercise.equipment })
      .from(schema.exercise)
      .where(and(...scope, ...exerciseFilterConditions(params, { equipment: true }))),
  ]);
  return {
    categories: categories.map((r) => r.value),
    equipment: equipment.map((r) => r.value),
  };
}

export async function exerciseOriginCounts(
  db: TenantContext["db"],
  scope: SQL[],
): Promise<{ base: number; clinic: number }> {
  const [counts] = await db
    .select({
      base: sql<number>`count(*) filter (where ${schema.exercise.clinicId} is null)::int`,
      clinic: sql<number>`count(*) filter (where ${schema.exercise.clinicId} is not null)::int`,
    })
    .from(schema.exercise)
    .where(and(...scope));
  return counts ?? { base: 0, clinic: 0 };
}

export function exerciseValues(input: ExerciseFormValues) {
  const map = bodyMapOf(input.target, input.secondaryMuscles);
  return {
    name: input.name,
    nameEn: input.nameEn,
    description: input.description,
    descriptionEn: input.descriptionEn,
    searchText: exerciseSearchText(input.name, input.nameEn),
    bodyPart: input.bodyPart,
    category: input.category,
    equipment: input.equipment,
    machineKind: input.machineKind,
    target: input.target,
    secondaryMuscles: input.secondaryMuscles,
    mapPrimary: map.primaries,
    mapSecondary: map.secondaries,
    muscleWeights: muscleWeightsFor(map),
    needs: input.needs,
    hold: input.hold,
    instructions: input.instructions,
    instructionsEn: input.instructionsEn,
    image: input.image,
  };
}
