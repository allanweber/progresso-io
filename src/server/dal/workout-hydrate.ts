import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema } from "@/db";
import type {
  BodyMapMuscle,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseMediaSet,
  ExerciseOrigin,
  ExerciseTarget,
} from "@/lib/exercises";
import {
  normalizeReps,
  resolveSets,
  type WorkoutDetailDto,
  type WorkoutExerciseDto,
  type WorkoutExerciseSubstituteDto,
  type WorkoutReps,
} from "@/lib/workouts";
import type { WorkoutTechnique } from "@/lib/workout-techniques";
import { todayYmd } from "@/lib/calendar";
import {
  buildOpenGymPlan,
  type OpenGymExerciseInfo,
  type OpenGymExportResponse,
} from "@/lib/opengym-plan";
import type { TenantContext } from "@/server/tenant";

const NO_MEDIA: ExerciseMediaSet = {
  image: null,
  video: null,
  femaleImage: null,
  femaleVideo: null,
};

export type ExerciseCatalog = ExerciseMediaSet & {
  id: string;
  name: string;
  code: string | null;
  origin: ExerciseOrigin;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  target: ExerciseTarget;
  mapPrimary: BodyMapMuscle[];
  mapSecondary: BodyMapMuscle[];
  instructions: string[];
  librarySubstitutes: (ExerciseMediaSet & {
    exerciseId: string;
    name: string;
    code: string | null;
    origin: ExerciseOrigin;
    instructions: string[];
    mapPrimary: BodyMapMuscle[];
  })[];
};

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
      target: e.target,
      mapPrimary: e.mapPrimary,
      mapSecondary: e.mapSecondary,
      image: e.image,
      video: e.video,
      femaleImage: e.femaleImage,
      femaleVideo: e.femaleVideo,
      instructions: e.instructions,
      subExId: subEx.id,
      subName: subEx.name,
      subCode: subEx.code,
      subMedia: {
        image: subEx.image,
        video: subEx.video,
        femaleImage: subEx.femaleImage,
        femaleVideo: subEx.femaleVideo,
      },
      subInstructions: subEx.instructions,
      subMapPrimary: subEx.mapPrimary,
      subClinicId: subEx.clinicId,
    })
    .from(e)
    .leftJoin(
      sub,
      and(
        eq(sub.exerciseId, e.id),
        or(isNull(sub.clinicId), eq(sub.clinicId, ctx.clinicId)),
      ),
    )
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
        target: r.target,
        mapPrimary: r.mapPrimary ?? [],
        mapSecondary: r.mapSecondary ?? [],
        image: r.image,
        video: r.video,
        femaleImage: r.femaleImage,
        femaleVideo: r.femaleVideo,
        instructions: r.instructions ?? [],
        librarySubstitutes: [],
      };
      map.set(r.id, cat);
      seenSub.set(r.id, new Set());
    }
    if (r.subExId) {
      const seen = seenSub.get(r.id)!;
      if (!seen.has(r.subExId)) {
        seen.add(r.subExId);
        cat.librarySubstitutes.push({
          exerciseId: r.subExId,
          name: r.subName!,
          code: r.subCode,
          origin: r.subClinicId === null ? "base" : "clinic",
          ...(r.subMedia ?? NO_MEDIA),
          instructions: r.subInstructions ?? [],
          mapPrimary: r.subMapPrimary ?? [],
        });
      }
    }
  }
  return map;
}

function placeholder(p: ExercisePrescription): WorkoutExerciseDto {
  return {
    id: p.id,
    exerciseId: p.exerciseId,
    name: "Exercício indisponível",
    code: null,
    origin: "base",
    category: null,
    equipment: null,
    target: null,
    mapPrimary: [],
    mapSecondary: [],
    ...NO_MEDIA,
    instructions: [],
    available: false,
    sets: resolveSets(normalizeReps(p.reps), p.sets),
    reps: normalizeReps(p.reps),
    load: p.load,
    rest: p.rest,
    note: p.note,
    technique: p.technique,
    groupId: p.groupId,
    substitutes: [],
  };
}

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
      image: sc?.image ?? null,
      video: sc?.video ?? null,
      femaleImage: sc?.femaleImage ?? null,
      femaleVideo: sc?.femaleVideo ?? null,
      instructions: sc?.instructions ?? [],
      mapPrimary: sc?.mapPrimary ?? [],
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
      image: s.image,
      video: s.video,
      femaleImage: s.femaleImage,
      femaleVideo: s.femaleVideo,
      instructions: s.instructions,
      mapPrimary: s.mapPrimary,
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
    target: cat.target,
    mapPrimary: cat.mapPrimary,
    mapSecondary: cat.mapSecondary,
    image: cat.image,
    video: cat.video,
    femaleImage: cat.femaleImage,
    femaleVideo: cat.femaleVideo,
    instructions: cat.instructions,
    available: true,
    sets: resolveSets(normalizeReps(p.reps), p.sets),
    reps: normalizeReps(p.reps),
    load: p.load,
    rest: p.rest,
    note: p.note,
    technique: p.technique,
    groupId: p.groupId,
    substitutes: [...custom, ...library],
  };
}

export function referencedExerciseIds(refs: ExercisePrescription[]): string[] {
  const ids = new Set<string>();
  for (const r of refs) {
    ids.add(r.exerciseId);
    for (const cs of r.customSubstitutes) ids.add(cs.exerciseId);
  }
  return [...ids];
}

export async function exportToOpenGym(
  ctx: TenantContext,
  workout: Pick<WorkoutDetailDto, "name" | "notes" | "cardio" | "sessions">,
  now: Date,
): Promise<OpenGymExportResponse> {
  const ids = new Set<string>();
  for (const s of workout.sessions) {
    for (const e of s.exercises) {
      ids.add(e.exerciseId);
      for (const sub of e.substitutes) ids.add(sub.exerciseId);
    }
  }

  const e = schema.exercise;
  const rows = ids.size
    ? await ctx.db
        .select({
          id: e.id,
          code: e.code,
          clinicId: e.clinicId,
          name: e.name,
          description: e.description,
          bodyPart: e.bodyPart,
          equipment: e.equipment,
          target: e.target,
          mapPrimary: e.mapPrimary,
          mapSecondary: e.mapSecondary,
          instructions: e.instructions,
        })
        .from(e)
        .where(
          and(
            inArray(e.id, [...ids]),
            or(isNull(e.clinicId), eq(e.clinicId, ctx.clinicId)),
          ),
        )
    : [];
  const exercises = new Map<string, OpenGymExerciseInfo>(
    rows.map(({ id, code, clinicId, ...info }) => [
      id,
      { ...info, openGymId: clinicId === null ? code : null },
    ]),
  );

  return buildOpenGymPlan(workout, exercises, todayYmd(now));
}
