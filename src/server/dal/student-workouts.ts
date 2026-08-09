import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { schema } from "@/db";
import {
  EMPTY_STRUCTURE,
  type StudentWorkoutDraftDto,
  type StudentWorkoutHistoryDto,
  type StudentWorkoutPublishedDto,
  type StudentWorkoutStateDto,
  type StudentWorkoutVersionDto,
  type WorkoutStructure,
} from "@/lib/student-workouts";
import type { WorkoutSessionDto } from "@/lib/workouts";
import type { TenantContext } from "@/server/tenant";
import {
  buildExerciseDto,
  loadExerciseCatalog,
  type ExerciseCatalog,
} from "./workout-hydrate";
import {
  createWorkout,
  detailToWriteInput,
  getWorkout,
  type WorkoutWriteInput,
} from "./workouts";

/**
 * Student-workout DAL. Every read and write is scoped by `ctx.clinicId` (+ the
 * `studentId`). A version stores only the **prescription structure** (exercise
 * refs + sets/reps/load/rest/technique + custom substitutes); the exercise
 * presentation and library substitutes are derived live from the catalog on read
 * (`hydrateStructure`), so a coach's catalog correction reaches every student
 * without a re-publish. Publishing numbers a version (1..N); the first publish of
 * a new workout archives the student's previous one.
 *
 * At most one draft version exists per student at a time, so the Treino tab is
 * always in exactly one of: draft / current / empty.
 */

/* -------------------------------------------------------------------------- */
/*  Structure ⇄ write input                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The persisted structure for a write payload. Unlike diets, a workout item
 * keeps its **custom substitutes** (cadastrados no treino); library substitutes
 * are still derived live on read, never stored.
 */
function toStructure(input: WorkoutWriteInput): WorkoutStructure {
  return {
    sessions: input.sessions.map((s) => ({
      name: s.name,
      items: s.exercises.map((x) => ({
        exerciseId: x.exerciseId,
        sets: x.sets,
        reps: x.reps,
        load: x.load,
        rest: x.rest,
        technique: x.technique,
        groupId: x.groupId,
        customSubstitutes: x.customSubstitutes.map((cs) => ({
          exerciseId: cs.exerciseId,
          note: cs.note,
        })),
      })),
    })),
  };
}

/** Every distinct exercise id a structure references (items + custom subs). */
function referencedExerciseIds(structure: WorkoutStructure): string[] {
  const ids = new Set<string>();
  for (const s of structure.sessions) {
    for (const it of s.items) {
      ids.add(it.exerciseId);
      for (const cs of it.customSubstitutes) ids.add(cs.exerciseId);
    }
  }
  return [...ids];
}

/** Hydrates a structure into a session tree using a preloaded catalog (no I/O). */
function hydrateWith(
  structure: WorkoutStructure,
  catalog: Map<string, ExerciseCatalog>,
): WorkoutSessionDto[] {
  return structure.sessions.map((s, si) => ({
    id: `s${si}`,
    name: s.name,
    position: si,
    exercises: s.items.map((it, ei) =>
      buildExerciseDto(
        {
          id: `s${si}e${ei}`,
          exerciseId: it.exerciseId,
          sets: it.sets,
          reps: it.reps,
          load: it.load,
          rest: it.rest,
          technique: it.technique,
          groupId: it.groupId,
          customSubstitutes: it.customSubstitutes,
        },
        catalog,
      ),
    ),
  }));
}

/** Loads the catalog for several structures at once — one joined query total. */
async function loadCatalogFor(
  ctx: TenantContext,
  structures: WorkoutStructure[],
): Promise<Map<string, ExerciseCatalog>> {
  const ids = new Set<string>();
  for (const st of structures) {
    for (const id of referencedExerciseIds(st)) ids.add(id);
  }
  return loadExerciseCatalog(ctx, [...ids]);
}

/**
 * Hydrates ONE stored structure into a read tree from the CURRENT catalog: the
 * exercise's live name, images, instructions, muscles and its library
 * substitutes (merged with the item's custom ones). A ref whose exercise is no
 * longer visible becomes an "Exercício indisponível" placeholder. One joined
 * query does the whole hydration.
 */
export async function hydrateStructure(
  ctx: TenantContext,
  structure: WorkoutStructure,
): Promise<WorkoutSessionDto[]> {
  const catalog = await loadCatalogFor(ctx, [structure]);
  return hydrateWith(structure, catalog);
}

/* -------------------------------------------------------------------------- */
/*  Write guards                                                               */
/* -------------------------------------------------------------------------- */

/** The write-time `invalid_exercise` guard: every referenced exercise visible. */
async function allExercisesVisible(
  ctx: TenantContext,
  structure: WorkoutStructure,
): Promise<boolean> {
  const ids = referencedExerciseIds(structure);
  if (ids.length === 0) return true;
  const rows = await ctx.db
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

/** Whether a structure has at least one exercise item (required to publish). */
function structureHasItems(structure: WorkoutStructure): boolean {
  return structure.sessions.some((s) => s.items.length > 0);
}

/* -------------------------------------------------------------------------- */
/*  Lookups                                                                    */
/* -------------------------------------------------------------------------- */

/** Whether the student exists inside this clinic (guards every operation). */
async function studentInClinic(
  ctx: TenantContext,
  studentId: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  return Boolean(row);
}

type DraftHandle = {
  workout: typeof schema.studentWorkout.$inferSelect;
  version: typeof schema.studentWorkoutVersion.$inferSelect;
};

/** The single in-flight draft version for this student, with its workout, or null. */
async function findDraft(
  ctx: TenantContext,
  studentId: string,
): Promise<DraftHandle | null> {
  const [row] = await ctx.db
    .select({
      workout: schema.studentWorkout,
      version: schema.studentWorkoutVersion,
    })
    .from(schema.studentWorkoutVersion)
    .innerJoin(
      schema.studentWorkout,
      eq(schema.studentWorkoutVersion.studentWorkoutId, schema.studentWorkout.id),
    )
    .where(
      and(
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
        eq(schema.studentWorkoutVersion.status, "draft"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Results                                                                    */
/* -------------------------------------------------------------------------- */

export type StudentWorkoutWriteResult =
  | { ok: true; workoutId: string; versionId: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "has_draft"
        | "invalid_exercise"
        | "no_active"
        | "empty";
    };

export type StudentWorkoutPublishResult =
  | { ok: true; workoutId: string; version: number }
  | { ok: false; reason: "not_found" | "invalid_exercise" | "empty" };

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything the Treino tab needs in one read: the aluno-visible current version,
 * the in-flight draft (if any) and the history. Returns null when the student
 * isn't in this clinic. The draft + current trees are hydrated together — one
 * joined catalog query for both.
 */
export async function getStudentWorkoutState(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentWorkoutStateDto | null> {
  if (!(await studentInClinic(ctx, studentId))) return null;

  const workouts = await ctx.db
    .select()
    .from(schema.studentWorkout)
    .where(
      and(
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
      ),
    )
    .orderBy(
      desc(schema.studentWorkout.createdAt),
      desc(schema.studentWorkout.id),
    );

  if (workouts.length === 0) {
    return { activeWorkoutId: null, current: null, draft: null, history: [] };
  }

  const workoutIds = workouts.map((w) => w.id);
  const versions = await ctx.db
    .select()
    .from(schema.studentWorkoutVersion)
    .where(inArray(schema.studentWorkoutVersion.studentWorkoutId, workoutIds));

  const publishedByWorkout = new Map<string, (typeof versions)[number][]>();
  for (const v of versions) {
    if (v.status !== "published") continue;
    const list = publishedByWorkout.get(v.studentWorkoutId) ?? [];
    list.push(v);
    publishedByWorkout.set(v.studentWorkoutId, list);
  }
  for (const list of publishedByWorkout.values()) {
    list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const draftVersion = versions.find((v) => v.status === "draft");
  const active = workouts.find((w) => w.status === "active") ?? null;
  const currentVersion = active
    ? (publishedByWorkout.get(active.id)?.[0] ?? null)
    : null;

  // Hydrate the draft + current trees together — one catalog query for both.
  const catalog = await loadCatalogFor(
    ctx,
    [draftVersion?.tree, currentVersion?.tree].filter(
      (t): t is WorkoutStructure => Boolean(t),
    ),
  );

  let draft: StudentWorkoutDraftDto | null = null;
  if (draftVersion) {
    const w = workoutById.get(draftVersion.studentWorkoutId)!;
    draft = {
      workoutId: w.id,
      workoutName: w.name,
      versionId: draftVersion.id,
      isNewWorkout: w.status === "draft",
      notes: draftVersion.notes,
      sessions: hydrateWith(draftVersion.tree, catalog),
    };
  }

  let current: StudentWorkoutPublishedDto | null = null;
  if (active && currentVersion) {
    current = {
      workoutId: active.id,
      workoutName: active.name,
      version: currentVersion.version!,
      publishedAt: currentVersion.publishedAt!.toISOString(),
      notes: currentVersion.notes,
      sessions: hydrateWith(currentVersion.tree, catalog),
    };
  }

  const history: StudentWorkoutHistoryDto[] = workouts
    .filter((w) => (publishedByWorkout.get(w.id)?.length ?? 0) > 0)
    .map((w) => ({
      workoutId: w.id,
      workoutName: w.name,
      status: w.status === "archived" ? "archived" : "active",
      versions: (publishedByWorkout.get(w.id) ?? []).map((v) => ({
        versionId: v.id,
        version: v.version!,
        publishedAt: v.publishedAt!.toISOString(),
      })),
    }));

  return { activeWorkoutId: active?.id ?? null, current, draft, history };
}

/** A single published version's tree, for the read-only history view, or null. */
export async function getStudentWorkoutVersion(
  ctx: TenantContext,
  studentId: string,
  versionId: string,
): Promise<StudentWorkoutVersionDto | null> {
  const [row] = await ctx.db
    .select({
      workout: schema.studentWorkout,
      version: schema.studentWorkoutVersion,
    })
    .from(schema.studentWorkoutVersion)
    .innerJoin(
      schema.studentWorkout,
      eq(schema.studentWorkoutVersion.studentWorkoutId, schema.studentWorkout.id),
    )
    .where(
      and(
        eq(schema.studentWorkoutVersion.id, versionId),
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
        eq(schema.studentWorkoutVersion.status, "published"),
      ),
    );
  if (!row) return null;
  return {
    workoutId: row.workout.id,
    workoutName: row.workout.name,
    version: row.version.version!,
    publishedAt: row.version.publishedAt!.toISOString(),
    notes: row.version.notes,
    sessions: await hydrateStructure(ctx, row.version.tree),
  };
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** Creates a brand-new blank workout (draft v1) for the student. */
export async function createBlankDraft(
  ctx: TenantContext,
  studentId: string,
  name: string,
): Promise<StudentWorkoutWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  return ctx.db.transaction(async (tx) => {
    const [w] = await tx
      .insert(schema.studentWorkout)
      .values({ clinicId: ctx.clinicId, studentId, name, status: "draft" })
      .returning({ id: schema.studentWorkout.id });
    const [v] = await tx
      .insert(schema.studentWorkoutVersion)
      .values({ studentWorkoutId: w.id, status: "draft", tree: EMPTY_STRUCTURE })
      .returning({ id: schema.studentWorkoutVersion.id });
    return { ok: true, workoutId: w.id, versionId: v.id };
  });
}

/** Copies one of the coach's template workouts to the student as a draft v1. */
export async function createFromTemplate(
  ctx: TenantContext,
  studentId: string,
  templateId: string,
  name?: string,
): Promise<StudentWorkoutWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  const detail = await getWorkout(ctx, templateId);
  if (!detail) return { ok: false, reason: "not_found" };

  const structure = toStructure(
    detailToWriteInput(detail.name, detail.notes, detail.sessions),
  );
  if (!(await allExercisesVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_exercise" };
  }

  return ctx.db.transaction(async (tx) => {
    const [w] = await tx
      .insert(schema.studentWorkout)
      .values({
        clinicId: ctx.clinicId,
        studentId,
        name: name?.trim() || detail.name,
        sourceWorkoutId: templateId,
        status: "draft",
      })
      .returning({ id: schema.studentWorkout.id });
    const [v] = await tx
      .insert(schema.studentWorkoutVersion)
      .values({
        studentWorkoutId: w.id,
        status: "draft",
        tree: structure,
        notes: detail.notes,
      })
      .returning({ id: schema.studentWorkoutVersion.id });
    return { ok: true, workoutId: w.id, versionId: v.id };
  });
}

/**
 * Opens a new draft to edit the active workout: clones its latest published
 * version's structure into a fresh draft version on the same workout (the aluno
 * keeps seeing the published one until this draft is published).
 */
export async function editActive(
  ctx: TenantContext,
  studentId: string,
): Promise<StudentWorkoutWriteResult> {
  if (!(await studentInClinic(ctx, studentId))) {
    return { ok: false, reason: "not_found" };
  }
  if (await findDraft(ctx, studentId)) return { ok: false, reason: "has_draft" };

  const [active] = await ctx.db
    .select()
    .from(schema.studentWorkout)
    .where(
      and(
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
        eq(schema.studentWorkout.status, "active"),
      ),
    );
  if (!active) return { ok: false, reason: "no_active" };

  const [latest] = await ctx.db
    .select()
    .from(schema.studentWorkoutVersion)
    .where(
      and(
        eq(schema.studentWorkoutVersion.studentWorkoutId, active.id),
        eq(schema.studentWorkoutVersion.status, "published"),
      ),
    )
    .orderBy(desc(schema.studentWorkoutVersion.version))
    .limit(1);

  const [v] = await ctx.db
    .insert(schema.studentWorkoutVersion)
    .values({
      studentWorkoutId: active.id,
      status: "draft",
      tree: latest?.tree ?? EMPTY_STRUCTURE,
      notes: latest?.notes ?? null,
    })
    .returning({ id: schema.studentWorkoutVersion.id });
  return { ok: true, workoutId: active.id, versionId: v.id };
}

/** Saves the in-flight draft (name + structure + notes). Does not publish. */
export async function saveDraft(
  ctx: TenantContext,
  studentId: string,
  input: WorkoutWriteInput,
): Promise<StudentWorkoutWriteResult> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return { ok: false, reason: "not_found" };

  const structure = toStructure(input);
  if (!(await allExercisesVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_exercise" };
  }

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(schema.studentWorkout)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(schema.studentWorkout.id, draft.workout.id));
    await tx
      .update(schema.studentWorkoutVersion)
      .set({ tree: structure, notes: input.notes, updatedAt: new Date() })
      .where(eq(schema.studentWorkoutVersion.id, draft.version.id));
  });
  return { ok: true, workoutId: draft.workout.id, versionId: draft.version.id };
}

/**
 * Publishes the in-flight draft: saves the payload, numbers the version (1..N
 * per workout) and freezes it. The first publish of a brand-new workout marks it
 * active and archives the student's previously-active workout. Requires ≥ 1 item.
 */
export async function publishDraft(
  ctx: TenantContext,
  studentId: string,
  input: WorkoutWriteInput,
): Promise<StudentWorkoutPublishResult> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return { ok: false, reason: "not_found" };

  const structure = toStructure(input);
  if (!(await allExercisesVisible(ctx, structure))) {
    return { ok: false, reason: "invalid_exercise" };
  }
  if (!structureHasItems(structure)) return { ok: false, reason: "empty" };

  return ctx.db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({
        max: sql<number>`coalesce(max(${schema.studentWorkoutVersion.version}), 0)`,
      })
      .from(schema.studentWorkoutVersion)
      .where(eq(schema.studentWorkoutVersion.studentWorkoutId, draft.workout.id));
    const nextVersion = Number(max) + 1;

    await tx
      .update(schema.studentWorkout)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(schema.studentWorkout.id, draft.workout.id));

    await tx
      .update(schema.studentWorkoutVersion)
      .set({
        tree: structure,
        notes: input.notes,
        status: "published",
        version: nextVersion,
        publishedAt: new Date(),
        publishedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.studentWorkoutVersion.id, draft.version.id));

    // A brand-new workout's first publish becomes active and archives the old one.
    if (draft.workout.status === "draft") {
      await tx
        .update(schema.studentWorkout)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentWorkout.clinicId, ctx.clinicId),
            eq(schema.studentWorkout.studentId, studentId),
            eq(schema.studentWorkout.status, "active"),
          ),
        );
      await tx
        .update(schema.studentWorkout)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(schema.studentWorkout.id, draft.workout.id));
    }

    return { ok: true, workoutId: draft.workout.id, version: nextVersion };
  });
}

/**
 * Discards the in-flight draft. If it was a brand-new workout (no published
 * versions), the whole `student_workout` is removed too. Returns false if there
 * is no draft.
 */
export async function discardDraft(
  ctx: TenantContext,
  studentId: string,
): Promise<boolean> {
  const draft = await findDraft(ctx, studentId);
  if (!draft) return false;

  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(schema.studentWorkoutVersion)
      .where(eq(schema.studentWorkoutVersion.id, draft.version.id));
    if (draft.workout.status === "draft") {
      await tx
        .delete(schema.studentWorkout)
        .where(eq(schema.studentWorkout.id, draft.workout.id));
    }
  });
  return true;
}

export type SaveWorkoutAsTemplateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "invalid_exercise" };

/**
 * Exports a student's workout version to the clinic's template catalog: builds a
 * new `workout` from the version's tree (reusing `createWorkout`). Defaults to
 * the active workout's latest published version; pass a `versionId` for a
 * specific one.
 */
export async function saveAsTemplate(
  ctx: TenantContext,
  studentId: string,
  versionId?: string,
): Promise<SaveWorkoutAsTemplateResult> {
  let source: StudentWorkoutVersionDto | null = null;
  if (versionId) {
    source = await getStudentWorkoutVersion(ctx, studentId, versionId);
  } else {
    const state = await getStudentWorkoutState(ctx, studentId);
    if (state?.current) {
      source = {
        workoutId: state.current.workoutId,
        workoutName: state.current.workoutName,
        version: state.current.version,
        publishedAt: state.current.publishedAt,
        notes: state.current.notes,
        sessions: state.current.sessions,
      };
    }
  }
  if (!source) return { ok: false, reason: "not_found" };

  const res = await createWorkout(
    ctx,
    detailToWriteInput(source.workoutName, source.notes, source.sessions),
  );
  if (!res.ok) return { ok: false, reason: "invalid_exercise" };
  return { ok: true, id: res.id };
}
