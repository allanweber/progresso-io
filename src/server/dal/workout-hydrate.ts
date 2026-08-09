import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema } from "@/db";
import type {
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseOrigin,
  Muscle,
} from "@/lib/exercises";
import {
  normalizeReps,
  type WorkoutExerciseDto,
  type WorkoutExerciseSubstituteDto,
  type WorkoutReps,
} from "@/lib/workouts";
import type { WorkoutTechnique } from "@/lib/workout-techniques";
import type { TenantContext } from "@/server/tenant";

/**
 * Shared workout hydration: turns exercise **references** (from the relational
 * template tables or a student version's JSON structure) into the hydrated
 * `WorkoutExerciseDto` the read views render — the exercise's live catalog data
 * (name, images, instructions, muscles) and its **library** substitutes, merged
 * with the item's **custom** substitutes.
 *
 * The catalog + library substitutes are fetched with **one joined SQL query**
 * (`loadExerciseCatalog`): `exercise LEFT JOIN exercise_substitution LEFT JOIN
 * exercise (as the substitute)`, scoped to the clinic. A caller gathers every
 * referenced exercise id (item exercises + custom-substitute exercises) once and
 * runs a single query, so a whole read stays at the minimum number of commands.
 */

const NONE_MUSCLES: Muscle[] = [];

/** An exercise's live catalog data plus its clinic-visible library substitutes. */
export type ExerciseCatalog = {
  id: string;
  name: string;
  code: string | null;
  origin: ExerciseOrigin;
  category: ExerciseCategory;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  images: string[];
  instructions: string[];
  librarySubstitutes: {
    exerciseId: string;
    name: string;
    code: string | null;
    origin: ExerciseOrigin;
    thumbnail: string | null;
  }[];
};

/**
 * A single exercise prescription, independent of how it was stored (a relational
 * `workout_exercise` row or a JSON `StructExerciseRef`). `id` is the id the DTO
 * should carry (the row id, or a synthetic index for a JSON tree).
 */
export type ExercisePrescription = {
  id: string;
  exerciseId: string;
  sets: number;
  reps: WorkoutReps;
  load: string | null;
  rest: number;
  note: string | null;
  technique: WorkoutTechnique | null;
  groupId: string | null;
  customSubstitutes: { exerciseId: string; note: string | null }[];
};

/**
 * Loads the live catalog data + library substitutes for a set of exercises in a
 * **single** joined query, scoped to what the clinic can see (base + own). The
 * `ids` should include every referenced exercise AND every custom-substitute
 * exercise, so their names/thumbnails resolve from the same map.
 */
export async function loadExerciseCatalog(
  ctx: TenantContext,
  ids: string[],
): Promise<Map<string, ExerciseCatalog>> {
  const map = new Map<string, ExerciseCatalog>();
  if (ids.length === 0) return map;

  const e = schema.exercise;
  const sub = schema.exerciseSubstitution;
  const subEx = alias(schema.exercise, "sub_ex");

  const rows = await ctx.db
    .select({
      id: e.id,
      name: e.name,
      code: e.code,
      clinicId: e.clinicId,
      category: e.category,
      equipment: e.equipment,
      primaryMuscles: e.primaryMuscles,
      images: e.images,
      instructions: e.instructions,
      subExId: subEx.id,
      subName: subEx.name,
      subCode: subEx.code,
      subImages: subEx.images,
      subClinicId: subEx.clinicId,
    })
    .from(e)
    // Library substitution rules visible to the clinic (base + own), in the ON
    // clause so an exercise with no visible rules still returns its own row.
    .leftJoin(
      sub,
      and(
        eq(sub.exerciseId, e.id),
        or(isNull(sub.clinicId), eq(sub.clinicId, ctx.clinicId)),
      ),
    )
    // The substitute exercise itself (never offer an archived one).
    .leftJoin(
      subEx,
      and(eq(sub.substituteExerciseId, subEx.id), eq(subEx.archived, false)),
    )
    .where(and(inArray(e.id, ids), or(isNull(e.clinicId), eq(e.clinicId, ctx.clinicId))))
    .orderBy(asc(subEx.name));

  const seenSub = new Map<string, Set<string>>();
  for (const r of rows) {
    let cat = map.get(r.id);
    if (!cat) {
      cat = {
        id: r.id,
        name: r.name,
        code: r.code,
        origin: r.clinicId === null ? "base" : "clinic",
        category: r.category,
        equipment: r.equipment,
        primaryMuscles: r.primaryMuscles ?? NONE_MUSCLES,
        images: r.images ?? [],
        instructions: r.instructions ?? [],
        librarySubstitutes: [],
      };
      map.set(r.id, cat);
      seenSub.set(r.id, new Set());
    }
    // Dedupe substitutes (a base + a clinic rule may point at the same exercise).
    if (r.subExId) {
      const seen = seenSub.get(r.id)!;
      if (!seen.has(r.subExId)) {
        seen.add(r.subExId);
        cat.librarySubstitutes.push({
          exerciseId: r.subExId,
          name: r.subName!,
          code: r.subCode,
          origin: r.subClinicId === null ? "base" : "clinic",
          thumbnail: r.subImages?.[0] ?? null,
        });
      }
    }
  }
  return map;
}

/** A placeholder DTO for a ref whose exercise is no longer visible (deleted). */
function placeholder(p: ExercisePrescription): WorkoutExerciseDto {
  return {
    id: p.id,
    exerciseId: p.exerciseId,
    name: "Exercício indisponível",
    code: null,
    origin: "base",
    category: null,
    equipment: null,
    primaryMuscles: [],
    images: [],
    instructions: [],
    available: false,
    sets: p.sets,
    reps: normalizeReps(p.reps),
    load: p.load,
    rest: p.rest,
    note: p.note,
    technique: p.technique,
    groupId: p.groupId,
    substitutes: [],
  };
}

/**
 * Builds a hydrated `WorkoutExerciseDto` from a prescription + the catalog map.
 * Custom substitutes (cadastrados no treino) come first, then the exercise's
 * live library substitutes (a library one is dropped if a custom already targets
 * the same exercise — the custom, with its note, wins).
 */
export function buildExerciseDto(
  p: ExercisePrescription,
  catalog: Map<string, ExerciseCatalog>,
): WorkoutExerciseDto {
  const cat = catalog.get(p.exerciseId);
  if (!cat) return placeholder(p);

  const custom: WorkoutExerciseSubstituteDto[] = p.customSubstitutes.map((cs) => {
    const sc = catalog.get(cs.exerciseId);
    return {
      exerciseId: cs.exerciseId,
      name: sc?.name ?? "Exercício indisponível",
      code: sc?.code ?? null,
      origin: sc?.origin ?? "base",
      thumbnail: sc?.images[0] ?? null,
      source: "custom" as const,
      note: cs.note,
    };
  });
  const customIds = new Set(custom.map((c) => c.exerciseId));
  const library: WorkoutExerciseSubstituteDto[] = cat.librarySubstitutes
    .filter((s) => !customIds.has(s.exerciseId))
    .map((s) => ({
      exerciseId: s.exerciseId,
      name: s.name,
      code: s.code,
      origin: s.origin,
      thumbnail: s.thumbnail,
      source: "library" as const,
      note: null,
    }));

  return {
    id: p.id,
    exerciseId: p.exerciseId,
    name: cat.name,
    code: cat.code,
    origin: cat.origin,
    category: cat.category,
    equipment: cat.equipment,
    primaryMuscles: cat.primaryMuscles,
    images: cat.images,
    instructions: cat.instructions,
    available: true,
    sets: p.sets,
    reps: normalizeReps(p.reps),
    load: p.load,
    rest: p.rest,
    note: p.note,
    technique: p.technique,
    groupId: p.groupId,
    substitutes: [...custom, ...library],
  };
}

/** Every distinct exercise id a set of prescriptions references (items + subs). */
export function referencedExerciseIds(refs: ExercisePrescription[]): string[] {
  const ids = new Set<string>();
  for (const r of refs) {
    ids.add(r.exerciseId);
    for (const cs of r.customSubstitutes) ids.add(cs.exerciseId);
  }
  return [...ids];
}
