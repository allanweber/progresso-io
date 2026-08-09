import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { DB } from "@/db";
import { schema } from "@/db";
import type { WorkoutOrigin, WorkoutReps, WorkoutSessionDto } from "@/lib/workouts";
import type { WorkoutTechnique } from "@/lib/workout-techniques";
import type { TenantContext } from "@/server/tenant";
import {
  buildExerciseDto,
  loadExerciseCatalog,
  referencedExerciseIds,
  type ExercisePrescription,
} from "./workout-hydrate";

/**
 * Workout (treino) DAL. A workout is a coach-authored, reusable training-program
 * template — the exercise analogue of a `diet`. A `workout` row with
 * `clinicId = null` is a shared base template (reserved for a future platform
 * catalog); a row with `clinicId` set is a clinic's own. Every read is scoped to
 * `clinicId IS NULL OR clinicId = ctx.clinicId`; writes always stamp
 * `ctx.clinicId` (+ `ctx.userId` as author) and scope by it, so a coach can only
 * touch its own workouts.
 *
 * The exercise presentation (name, images, instructions, muscles) and library
 * substitutes are **never stored** on a workout: an item holds only the
 * prescription (which exercise + sets/reps/load/rest/technique + custom
 * substitutes), and the rest is hydrated live from the catalog on read (see
 * `workout-hydrate`), so a coach's catalog correction propagates automatically.
 */

/** The transaction handle drizzle hands `db.transaction(async (tx) => …)`. */
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/* -------------------------------------------------------------------------- */
/*  Read types                                                                 */
/* -------------------------------------------------------------------------- */

export type WorkoutListItem = {
  id: string;
  name: string;
  origin: WorkoutOrigin;
  archived: boolean;
  sessionCount: number;
  exerciseCount: number;
  updatedAt: Date;
};

export type WorkoutListParams = {
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type WorkoutListResult = {
  items: WorkoutListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type WorkoutDetail = {
  id: string;
  name: string;
  notes: string | null;
  origin: WorkoutOrigin;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  sessions: WorkoutSessionDto[];
};

/* -------------------------------------------------------------------------- */
/*  Write types                                                                */
/* -------------------------------------------------------------------------- */

export type WorkoutCustomSubstituteInput = {
  exerciseId: string;
  note: string | null;
};

export type WorkoutExerciseInput = {
  exerciseId: string;
  sets: number;
  reps: WorkoutReps;
  load: string | null;
  rest: number;
  technique: WorkoutTechnique | null;
  groupId: string | null;
  customSubstitutes: WorkoutCustomSubstituteInput[];
};

export type WorkoutSessionInput = {
  name: string;
  exercises: WorkoutExerciseInput[];
};

export type WorkoutWriteInput = {
  name: string;
  notes: string | null;
  sessions: WorkoutSessionInput[];
};

export type WorkoutWriteResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid_exercise" };

/* -------------------------------------------------------------------------- */
/*  Scope + guards                                                             */
/* -------------------------------------------------------------------------- */

/** The tenant scope shared by every workout read: base templates + this clinic's. */
function visibleWorkout(ctx: TenantContext) {
  return or(
    isNull(schema.workout.clinicId),
    eq(schema.workout.clinicId, ctx.clinicId),
  );
}

/** Every distinct exercise id a write payload references (items + custom subs). */
function referencedInputExerciseIds(input: WorkoutWriteInput): string[] {
  const ids = new Set<string>();
  for (const s of input.sessions) {
    for (const ex of s.exercises) {
      ids.add(ex.exerciseId);
      for (const cs of ex.customSubstitutes) ids.add(cs.exerciseId);
    }
  }
  return [...ids];
}

/**
 * Whether every referenced exercise is visible to this clinic (a base exercise
 * or one of its own). A payload referencing another clinic's exercise — or a
 * non-existent id — fails, so a workout can never point at data it can't see.
 */
async function allExercisesVisible(
  ctx: TenantContext,
  db: DB | Tx,
  ids: string[],
): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(
      and(
        inArray(schema.exercise.id, ids),
        or(
          isNull(schema.exercise.clinicId),
          eq(schema.exercise.clinicId, ctx.clinicId),
        ),
      ),
    );
  return rows.length === ids.length;
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

function listWhere(ctx: TenantContext, params: WorkoutListParams) {
  const conds = [visibleWorkout(ctx)];
  if (!params.includeArchived) conds.push(eq(schema.workout.archived, false));
  const term = params.search?.trim();
  if (term) {
    for (const token of term.split(/\s+/)) {
      conds.push(
        sql`unaccent(lower(${schema.workout.name})) like '%' || unaccent(lower(${token})) || '%'`,
      );
    }
  }
  return and(...conds);
}

/**
 * A page of the workouts visible to this clinic (base templates + own),
 * excluding archived by default, each with its session/exercise counts. Ordered
 * by most recently updated.
 */
export async function listWorkouts(
  ctx: TenantContext,
  params: WorkoutListParams = {},
): Promise<WorkoutListResult> {
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = listWhere(ctx, params);

  const rows = await ctx.db
    .select({
      id: schema.workout.id,
      name: schema.workout.name,
      clinicId: schema.workout.clinicId,
      archived: schema.workout.archived,
      updatedAt: schema.workout.updatedAt,
      sessionCount: sql<number>`(
        select count(*)::int from workout_session s where s.workout_id = workout.id
      )`,
      exerciseCount: sql<number>`(
        select count(*)::int from workout_exercise x
        join workout_session s on s.id = x.workout_session_id
        where s.workout_id = workout.id
      )`,
    })
    .from(schema.workout)
    .where(where)
    .orderBy(desc(schema.workout.updatedAt), asc(schema.workout.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await ctx.db
    .select({ total: count() })
    .from(schema.workout)
    .where(where);

  const items: WorkoutListItem[] = rows.map(({ clinicId, ...r }) => ({
    ...r,
    origin: clinicId === null ? "base" : "clinic",
  }));

  return { items, total, page, pageSize };
}

/**
 * A single workout with its full hydrated tree — sessions (ordered), each
 * exercise's live catalog data + merged substitutes. Returns null when the id is
 * neither a base template nor one of this clinic's own workouts.
 */
export async function getWorkout(
  ctx: TenantContext,
  id: string,
): Promise<WorkoutDetail | null> {
  const [row] = await ctx.db
    .select()
    .from(schema.workout)
    .where(and(eq(schema.workout.id, id), visibleWorkout(ctx)));
  if (!row) return null;

  const sessions = await ctx.db
    .select()
    .from(schema.workoutSession)
    .where(eq(schema.workoutSession.workoutId, id))
    .orderBy(asc(schema.workoutSession.position), asc(schema.workoutSession.id));

  const sessionIds = sessions.map((s) => s.id);

  const exRows = sessionIds.length
    ? await ctx.db
        .select()
        .from(schema.workoutExercise)
        .where(inArray(schema.workoutExercise.workoutSessionId, sessionIds))
        .orderBy(
          asc(schema.workoutExercise.position),
          asc(schema.workoutExercise.id),
        )
    : [];

  const exIds = exRows.map((x) => x.id);
  const subRows = exIds.length
    ? await ctx.db
        .select()
        .from(schema.workoutExerciseSubstitute)
        .where(inArray(schema.workoutExerciseSubstitute.workoutExerciseId, exIds))
        .orderBy(
          asc(schema.workoutExerciseSubstitute.position),
          asc(schema.workoutExerciseSubstitute.id),
        )
    : [];

  const subsByExercise = new Map<string, WorkoutCustomSubstituteInput[]>();
  for (const s of subRows) {
    const list = subsByExercise.get(s.workoutExerciseId) ?? [];
    list.push({ exerciseId: s.substituteExerciseId, note: s.note });
    subsByExercise.set(s.workoutExerciseId, list);
  }

  const prescriptions: (ExercisePrescription & { sessionId: string })[] = exRows.map(
    (x) => ({
      id: x.id,
      sessionId: x.workoutSessionId,
      exerciseId: x.exerciseId,
      sets: x.sets,
      reps: x.reps,
      load: x.load,
      rest: x.rest,
      technique: x.technique,
      groupId: x.groupId,
      customSubstitutes: subsByExercise.get(x.id) ?? [],
    }),
  );

  const catalog = await loadExerciseCatalog(ctx, referencedExerciseIds(prescriptions));

  const dtoBySession = new Map<string, WorkoutSessionDto["exercises"]>();
  for (const p of prescriptions) {
    const list = dtoBySession.get(p.sessionId) ?? [];
    list.push(buildExerciseDto(p, catalog));
    dtoBySession.set(p.sessionId, list);
  }

  const sessionDtos: WorkoutSessionDto[] = sessions.map((s, i) => ({
    id: s.id,
    name: s.name,
    position: i,
    exercises: dtoBySession.get(s.id) ?? [],
  }));

  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    origin: row.clinicId === null ? "base" : "clinic",
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sessions: sessionDtos,
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes (clinic-owned workouts only)                                        */
/* -------------------------------------------------------------------------- */

/** Inserts a workout's session/exercise/substitute tree, stamping `position`. */
async function insertTree(
  db: Tx,
  workoutId: string,
  sessions: WorkoutSessionInput[],
): Promise<void> {
  for (const [sPos, session] of sessions.entries()) {
    const [insertedSession] = await db
      .insert(schema.workoutSession)
      .values({ workoutId, name: session.name, position: sPos })
      .returning({ id: schema.workoutSession.id });

    for (const [xPos, ex] of session.exercises.entries()) {
      const [insertedEx] = await db
        .insert(schema.workoutExercise)
        .values({
          workoutSessionId: insertedSession.id,
          exerciseId: ex.exerciseId,
          sets: ex.sets,
          reps: ex.reps,
          load: ex.load,
          rest: ex.rest,
          technique: ex.technique,
          groupId: ex.groupId,
          position: xPos,
        })
        .returning({ id: schema.workoutExercise.id });

      if (ex.customSubstitutes.length) {
        await db.insert(schema.workoutExerciseSubstitute).values(
          ex.customSubstitutes.map((cs, subPos) => ({
            workoutExerciseId: insertedEx.id,
            substituteExerciseId: cs.exerciseId,
            note: cs.note,
            position: subPos,
          })),
        );
      }
    }
  }
}

/**
 * Creates a clinic-owned workout with its full tree. `clinicId`/`coachId` are
 * stamped from the context — never from client input. Returns `invalid_exercise`
 * when any referenced exercise isn't visible to the clinic.
 */
export async function createWorkout(
  ctx: TenantContext,
  input: WorkoutWriteInput,
): Promise<WorkoutWriteResult> {
  if (!(await allExercisesVisible(ctx, ctx.db, referencedInputExerciseIds(input)))) {
    return { ok: false, reason: "invalid_exercise" };
  }

  const id = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.workout)
      .values({
        clinicId: ctx.clinicId,
        coachId: ctx.userId,
        name: input.name,
        notes: input.notes,
      })
      .returning({ id: schema.workout.id });
    await insertTree(tx, row.id, input.sessions);
    return row.id;
  });

  return { ok: true, id };
}

/** The " (cópia)" suffix, and the workout-name cap it has to fit inside. */
const COPY_SUFFIX = " (cópia)";
const NAME_MAX = 120;

/** Appends " (cópia)", trimming the base name so the result fits `NAME_MAX`. */
function copyName(name: string): string {
  const base =
    name.length + COPY_SUFFIX.length > NAME_MAX
      ? name.slice(0, NAME_MAX - COPY_SUFFIX.length).trimEnd()
      : name;
  return `${base}${COPY_SUFFIX}`;
}

/** Turns a hydrated workout tree into a write input (for copy / save-as-template). */
export function detailToWriteInput(
  name: string,
  notes: string | null,
  sessions: WorkoutSessionDto[],
): WorkoutWriteInput {
  return {
    name,
    notes,
    sessions: sessions.map((s) => ({
      name: s.name,
      exercises: s.exercises.map((x) => ({
        exerciseId: x.exerciseId,
        sets: x.sets,
        reps: x.reps,
        load: x.load,
        rest: x.rest,
        technique: x.technique,
        groupId: x.groupId,
        // Only the custom substitutes are the workout's own; library ones are
        // live and must not be copied into it.
        customSubstitutes: x.substitutes
          .filter((sub) => sub.source === "custom")
          .map((sub) => ({ exerciseId: sub.exerciseId, note: sub.note })),
      })),
    })),
  };
}

/**
 * Creates an exact copy of a workout the clinic can see — a base template or one
 * of its own — as a new **clinic-owned** workout named "<name> (cópia)". The
 * whole tree (sessions, exercises, prescriptions and custom substitutes) is
 * duplicated. Returns `not_found` when the source isn't visible.
 */
export async function copyWorkout(
  ctx: TenantContext,
  id: string,
): Promise<WorkoutWriteResult> {
  const source = await getWorkout(ctx, id);
  if (!source) return { ok: false, reason: "not_found" };
  return createWorkout(
    ctx,
    detailToWriteInput(copyName(source.name), source.notes, source.sessions),
  );
}

/**
 * Updates one of this clinic's own workouts, replacing its whole tree. Scoped to
 * `clinic_id = ctx.clinicId`, so a base template or another clinic's workout is
 * never matched (`not_found`). The old tree is deleted (cascade) and re-inserted.
 */
export async function updateWorkout(
  ctx: TenantContext,
  id: string,
  input: WorkoutWriteInput,
): Promise<WorkoutWriteResult> {
  if (!(await allExercisesVisible(ctx, ctx.db, referencedInputExerciseIds(input)))) {
    return { ok: false, reason: "invalid_exercise" };
  }

  const ok = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.workout)
      .set({ name: input.name, notes: input.notes, updatedAt: new Date() })
      .where(
        and(eq(schema.workout.id, id), eq(schema.workout.clinicId, ctx.clinicId)),
      )
      .returning({ id: schema.workout.id });
    if (!row) return false;

    await tx
      .delete(schema.workoutSession)
      .where(eq(schema.workoutSession.workoutId, id));
    await insertTree(tx, id, input.sessions);
    return true;
  });

  return ok ? { ok: true, id } : { ok: false, reason: "not_found" };
}

/** Soft-removes one of this clinic's workouts (kept in the DB, hidden in lists). */
export async function archiveWorkout(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.workout)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.workout.id, id), eq(schema.workout.clinicId, ctx.clinicId)))
    .returning({ id: schema.workout.id });
  return rows.length > 0;
}

/** Restores one of this clinic's archived workouts. Returns false when not own. */
export async function unarchiveWorkout(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.workout)
    .set({ archived: false, updatedAt: new Date() })
    .where(and(eq(schema.workout.id, id), eq(schema.workout.clinicId, ctx.clinicId)))
    .returning({ id: schema.workout.id });
  return rows.length > 0;
}

export type WorkoutDeleteResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_archived" | "in_use" };

/**
 * Permanently deletes one of this clinic's template workouts — allowed only when
 * it is already **archived** and **no student workout references it** (via
 * `source_workout_id`). A base template (clinic_id NULL) is never matched.
 */
export async function deleteWorkout(
  ctx: TenantContext,
  id: string,
): Promise<WorkoutDeleteResult> {
  const [row] = await ctx.db
    .select({ archived: schema.workout.archived })
    .from(schema.workout)
    .where(and(eq(schema.workout.id, id), eq(schema.workout.clinicId, ctx.clinicId)));
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.archived) return { ok: false, reason: "not_archived" };

  const [ref] = await ctx.db
    .select({ id: schema.studentWorkout.id })
    .from(schema.studentWorkout)
    .where(eq(schema.studentWorkout.sourceWorkoutId, id))
    .limit(1);
  if (ref) return { ok: false, reason: "in_use" };

  await ctx.db
    .delete(schema.workout)
    .where(and(eq(schema.workout.id, id), eq(schema.workout.clinicId, ctx.clinicId)));
  return { ok: true };
}
