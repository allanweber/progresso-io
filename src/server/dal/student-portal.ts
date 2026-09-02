import { aliasedTable, and, eq } from "drizzle-orm";

import { schema } from "@/db";
import { canUseBrandedPortal } from "@/lib/clinic-settings";
import { effectivePlanOf } from "@/lib/plans";
import type {
  StudentDietHistoryDto,
  StudentDietPublishedDto,
  StudentDietVersionDto,
} from "@/lib/student-diets";
import type {
  StudentWorkoutHistoryDto,
  StudentWorkoutPublishedDto,
  StudentWorkoutVersionDto,
} from "@/lib/student-workouts";
import type {
  AlunoProfileDto,
  MyDietStateDto,
  MyWorkoutStateDto,
} from "@/lib/student-portal";
import type { TenantContext } from "@/server/tenant";
import { hydrateStructure } from "./student-diets";
import { hydrateStructure as hydrateWorkoutStructure } from "./student-workouts";

/**
 * Aluno-portal DAL. Everything here is read-only and **doubly scoped**: by
 * `ctx.clinicId` (the tenant) AND by the student row that belongs to the
 * authenticated user (`students.userId = ctx.userId`). The aluno never supplies
 * a `studentId`, so it is impossible to read another student's data.
 *
 * Only **published** versions are ever selected — drafts are invisible to the
 * aluno and are never loaded here (unlike the coach's `getStudentDietState`).
 */

/**
 * The student row owned by the authenticated aluno, within their clinic, or
 * null when the user has no linked student (e.g. a coach/admin, or an aluno not
 * yet linked). Every other function funnels through this.
 */
async function ownStudentId(ctx: TenantContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.userId, ctx.userId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  return row?.id ?? null;
}

/** The aluno's identity for the portal chrome, or null if not a linked aluno. */
export async function getMyProfile(
  ctx: TenantContext,
): Promise<AlunoProfileDto | null> {
  const coach = aliasedTable(schema.user, "coach");
  const [row] = await ctx.db
    .select({
      firstName: schema.students.firstName,
      lastName: schema.students.lastName,
      goal: schema.students.goal,
      coachName: coach.name,
      clinicName: schema.clinic.name,
      feedbackFrequency: schema.clinic.feedbackFrequency,
      feedbackPreferredDay: schema.clinic.feedbackPreferredDay,
      logoKey: schema.clinic.logoKey,
      plan: schema.clinic.plan,
      intendedPlan: schema.clinic.intendedPlan,
      trialEndsAt: schema.clinic.trialEndsAt,
    })
    .from(schema.students)
    .innerJoin(schema.clinic, eq(schema.clinic.id, schema.students.clinicId))
    .leftJoin(coach, eq(coach.id, schema.students.coachId))
    .where(
      and(
        eq(schema.students.userId, ctx.userId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  if (!row) return null;
  return {
    name: `${row.firstName} ${row.lastName}`.trim(),
    firstName: row.firstName,
    coachName: row.coachName,
    clinicName: row.clinicName,
    // The same gate the public portal applies, so a clinic's own aluno and a
    // visitor to its microsite are never told different things about whether it
    // is branded.
    clinicHasLogo:
      row.logoKey !== null &&
      canUseBrandedPortal(effectivePlanOf(row, new Date())),
    goal: row.goal,
    feedbackFrequency: row.feedbackFrequency,
    feedbackPreferredDay: row.feedbackPreferredDay,
  };
}

/**
 * The aluno's diet state: the active published version (or null) and the
 * read-only history. Returns `null` only when the user isn't a linked aluno;
 * an aluno with no published diet yet gets `{ current: null, history: [] }`.
 */
export async function getMyDietState(
  ctx: TenantContext,
): Promise<MyDietStateDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const diets = await ctx.db
    .select()
    .from(schema.studentDiet)
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
      ),
    );

  if (diets.length === 0) return { current: null, history: [] };

  // Published versions only — drafts are never selected.
  const rows = await ctx.db
    .select({
      dietId: schema.studentDietVersion.studentDietId,
      versionId: schema.studentDietVersion.id,
      version: schema.studentDietVersion.version,
      publishedAt: schema.studentDietVersion.publishedAt,
      notes: schema.studentDietVersion.notes,
      tree: schema.studentDietVersion.tree,
    })
    .from(schema.studentDietVersion)
    .innerJoin(
      schema.studentDiet,
      eq(schema.studentDietVersion.studentDietId, schema.studentDiet.id),
    )
    .where(
      and(
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDietVersion.status, "published"),
      ),
    );

  const publishedByDiet = new Map<string, (typeof rows)[number][]>();
  for (const v of rows) {
    const list = publishedByDiet.get(v.dietId) ?? [];
    list.push(v);
    publishedByDiet.set(v.dietId, list);
  }
  for (const list of publishedByDiet.values()) {
    list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  // Current = the active diet's latest published version.
  const active = diets.find((d) => d.status === "active") ?? null;
  let current: StudentDietPublishedDto | null = null;
  if (active) {
    const latest = publishedByDiet.get(active.id)?.[0];
    if (latest) {
      current = {
        dietId: active.id,
        dietName: active.name,
        version: latest.version!,
        publishedAt: latest.publishedAt!.toISOString(),
        notes: latest.notes,
        tree: await hydrateStructure(ctx, latest.tree),
      };
    }
  }

  // History: every diet that has at least one published version, newest first.
  const history: StudentDietHistoryDto[] = diets
    .filter((d) => (publishedByDiet.get(d.id)?.length ?? 0) > 0)
    .sort((a, b) => {
      // Active first, then by most recent creation.
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((d) => ({
      dietId: d.id,
      dietName: d.name,
      status: d.status === "archived" ? "archived" : "active",
      versions: (publishedByDiet.get(d.id) ?? []).map((v) => ({
        versionId: v.versionId,
        version: v.version!,
        publishedAt: v.publishedAt!.toISOString(),
      })),
    }));

  return { current, history };
}

/**
 * A single published version's tree, for the read-only history view — scoped to
 * the aluno's own student and to `published` status, so an aluno can never open
 * a draft or another student's version. Null when not found/allowed.
 */
export async function getMyDietVersion(
  ctx: TenantContext,
  versionId: string,
): Promise<StudentDietVersionDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const [row] = await ctx.db
    .select({ diet: schema.studentDiet, version: schema.studentDietVersion })
    .from(schema.studentDietVersion)
    .innerJoin(
      schema.studentDiet,
      eq(schema.studentDietVersion.studentDietId, schema.studentDiet.id),
    )
    .where(
      and(
        eq(schema.studentDietVersion.id, versionId),
        eq(schema.studentDiet.clinicId, ctx.clinicId),
        eq(schema.studentDiet.studentId, studentId),
        eq(schema.studentDietVersion.status, "published"),
      ),
    );
  if (!row) return null;
  return {
    dietId: row.diet.id,
    dietName: row.diet.name,
    version: row.version.version!,
    publishedAt: row.version.publishedAt!.toISOString(),
    notes: row.version.notes,
    tree: await hydrateStructure(ctx, row.version.tree),
  };
}

/* -------------------------------------------------------------------------- */
/*  Workout (treino)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The aluno's workout state: the active published version (or null) and the
 * read-only history. Returns `null` only when the user isn't a linked aluno; an
 * aluno with no published workout yet gets `{ current: null, history: [] }`.
 */
export async function getMyWorkoutState(
  ctx: TenantContext,
): Promise<MyWorkoutStateDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

  const workouts = await ctx.db
    .select()
    .from(schema.studentWorkout)
    .where(
      and(
        eq(schema.studentWorkout.clinicId, ctx.clinicId),
        eq(schema.studentWorkout.studentId, studentId),
      ),
    );

  if (workouts.length === 0) return { current: null, history: [] };

  // Published versions only — drafts are never selected.
  const rows = await ctx.db
    .select({
      workoutId: schema.studentWorkoutVersion.studentWorkoutId,
      versionId: schema.studentWorkoutVersion.id,
      version: schema.studentWorkoutVersion.version,
      publishedAt: schema.studentWorkoutVersion.publishedAt,
      notes: schema.studentWorkoutVersion.notes,
      cardio: schema.studentWorkoutVersion.cardio,
      tree: schema.studentWorkoutVersion.tree,
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
        eq(schema.studentWorkoutVersion.status, "published"),
      ),
    );

  const publishedByWorkout = new Map<string, (typeof rows)[number][]>();
  for (const v of rows) {
    const list = publishedByWorkout.get(v.workoutId) ?? [];
    list.push(v);
    publishedByWorkout.set(v.workoutId, list);
  }
  for (const list of publishedByWorkout.values()) {
    list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  }

  const active = workouts.find((w) => w.status === "active") ?? null;
  let current: StudentWorkoutPublishedDto | null = null;
  if (active) {
    const latest = publishedByWorkout.get(active.id)?.[0];
    if (latest) {
      current = {
        workoutId: active.id,
        workoutName: active.name,
        version: latest.version!,
        publishedAt: latest.publishedAt!.toISOString(),
        notes: latest.notes,
        cardio: latest.cardio,
        sessions: await hydrateWorkoutStructure(ctx, latest.tree),
      };
    }
  }

  const history: StudentWorkoutHistoryDto[] = workouts
    .filter((w) => (publishedByWorkout.get(w.id)?.length ?? 0) > 0)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((w) => ({
      workoutId: w.id,
      workoutName: w.name,
      status: w.status === "archived" ? "archived" : "active",
      versions: (publishedByWorkout.get(w.id) ?? []).map((v) => ({
        versionId: v.versionId,
        version: v.version!,
        publishedAt: v.publishedAt!.toISOString(),
      })),
    }));

  return { current, history };
}

/**
 * A single published workout version's tree — scoped to the aluno's own student
 * and `published` status, so an aluno can never open a draft or another
 * student's version. Null when not found/allowed.
 */
export async function getMyWorkoutVersion(
  ctx: TenantContext,
  versionId: string,
): Promise<StudentWorkoutVersionDto | null> {
  const studentId = await ownStudentId(ctx);
  if (!studentId) return null;

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
    cardio: row.version.cardio,
    sessions: await hydrateWorkoutStructure(ctx, row.version.tree),
  };
}
