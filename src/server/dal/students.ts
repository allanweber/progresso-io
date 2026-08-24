import { and, asc, desc, eq, gt, isNull, ne } from "drizzle-orm";

import { type Database, schema } from "@/db";
import type { Modality, Student, StudentStatus } from "@/db/schema";
import type { TenantContext } from "@/server/tenant";

/**
 * Reference DAL module. Every function is scoped to `ctx.clinicId`: there is no
 * way to read or write another clinic's students. New feature tables MUST
 * follow this shape (see the DAL rule in AGENTS.md).
 */

/** Values accepted when creating/updating a student (never includes clinicId). */
export type StudentInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  goal?: string | null;
  modality?: Modality;
  status?: StudentStatus;
  coachId?: string | null;
};

/**
 * A student enriched with derived access flags for the roster:
 * - `hasAccount`   — the aluno has activated a login (portal access).
 * - `pendingInvite` — an unaccepted, unexpired invite is outstanding.
 */
export type StudentRoster = Student & {
  hasAccount: boolean;
  pendingInvite: boolean;
};

/**
 * Lists every student in the clinic (newest first), each enriched with access
 * flags. Archived students are included; the UI filters them — keeping them
 * here means "arquivados" stays a reachable filter.
 */
export async function listStudents(ctx: TenantContext): Promise<StudentRoster[]> {
  const rows = await ctx.db
    .select()
    .from(schema.students)
    .where(eq(schema.students.clinicId, ctx.clinicId))
    .orderBy(desc(schema.students.createdAt));

  // Student ids with a still-valid, unaccepted invite (one round-trip).
  const pending = await ctx.db
    .select({ studentId: schema.invitation.studentId })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.clinicId, ctx.clinicId),
        isNull(schema.invitation.acceptedAt),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );
  const pendingIds = new Set(pending.map((p) => p.studentId));

  return rows.map((s) => ({
    ...s,
    hasAccount: s.userId !== null,
    pendingInvite: pendingIds.has(s.id),
  }));
}

export async function getStudent(
  ctx: TenantContext,
  id: string,
): Promise<Student | null> {
  const [student] = await ctx.db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.id, id),
      ),
    );
  return student ?? null;
}

/** A single student enriched with the same access flags as the roster. */
export async function getStudentRoster(
  ctx: TenantContext,
  id: string,
): Promise<StudentRoster | null> {
  const student = await getStudent(ctx, id);
  if (!student) return null;

  const [pending] = await ctx.db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.clinicId, ctx.clinicId),
        eq(schema.invitation.studentId, id),
        isNull(schema.invitation.acceptedAt),
        gt(schema.invitation.expiresAt, new Date()),
      ),
    );

  return {
    ...student,
    hasAccount: student.userId !== null,
    pendingInvite: Boolean(pending),
  };
}

export async function findStudentByEmail(
  ctx: TenantContext,
  email: string,
): Promise<Student | null> {
  const [student] = await ctx.db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.email, email),
      ),
    );
  return student ?? null;
}

/**
 * Finds a student in this clinic by their normalized WhatsApp number — the new
 * primary identifier. Used to enforce the per-clinic phone uniqueness on
 * create/edit before the DB index would reject it.
 */
export async function findStudentByPhone(
  ctx: TenantContext,
  phone: string,
): Promise<Student | null> {
  const [student] = await ctx.db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.phone, phone),
      ),
    );
  return student ?? null;
}

/**
 * Number of student "seats" used by the clinic. Archived students don't count —
 * archiving frees a slot — so this is what the plan limit is measured against.
 */
export async function countStudents(ctx: TenantContext): Promise<number> {
  const rows = await ctx.db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        ne(schema.students.status, "archived"),
      ),
    );
  return rows.length;
}

/** A student on the coach dashboard's "sem treino ou dieta" list. */
export type MissingPlanStudent = {
  id: string;
  firstName: string;
  lastName: string;
  goal: string | null;
  missingDiet: boolean;
  missingWorkout: boolean;
  /** Join day — how long this aluno has been waiting for a plan. */
  createdAt: Date;
};

/** A student check-in awaiting the coach's feedback (dashboard triage). */
export type PendingCheckin = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  date: string;
  weightKg: number | null;
};

/**
 * A plan version still sitting in `draft` — written but never published, so the
 * aluno cannot see it. Principle 2: nothing reaches the student until the coach
 * publishes, which makes a forgotten draft real, invisible work.
 */
export type PendingDraft = {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  kind: "diet" | "workout";
  /** Last edit — how long this draft has sat unpublished. */
  updatedAt: Date;
};

/** The real (data-backed) part of the coach dashboard. */
export type CoachDashboard = {
  activeCount: number;
  missingPlans: MissingPlanStudent[];
  /** Aluno-submitted check-ins with no coach response yet (newest first). */
  pendingCheckins: PendingCheckin[];
  /** Never-published diet/workout drafts, longest-untouched first. */
  pendingDrafts: PendingDraft[];
};

/**
 * Hard ceiling on each unbounded dashboard list. The active-student query needs
 * no cap — a clinic's roster is already bounded by its plan (100 on Clínica) and
 * the full set is needed for the count and the has-a-plan set difference. These
 * three can grow without limit, so they are capped at the source: the dashboard
 * shows a queue, not an archive.
 */
const DASHBOARD_LIST_LIMIT = 50;

/**
 * Powers the coach dashboard's two real cards: the active-student count and the
 * "sem treino ou dieta" list. A student "has a plan" once their `student_diet` /
 * `student_workout` reaches `active` (i.e. has ≥ 1 published version); until then
 * it's missing. Only `active` students count — inactive/archived aren't the
 * coach's live queue. Tenant-scoped like every DAL read.
 */
export async function getCoachDashboard(
  ctx: TenantContext,
): Promise<CoachDashboard> {
  const [active, dietRows, workoutRows, pendingRows, dietDrafts, workoutDrafts] =
    await Promise.all([
    ctx.db
      .select({
        id: schema.students.id,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        goal: schema.students.goal,
        createdAt: schema.students.createdAt,
      })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.clinicId, ctx.clinicId),
          eq(schema.students.status, "active"),
        ),
      )
      .orderBy(desc(schema.students.createdAt)),
    ctx.db
      .select({ studentId: schema.studentDiet.studentId })
      .from(schema.studentDiet)
      .where(
        and(
          eq(schema.studentDiet.clinicId, ctx.clinicId),
          eq(schema.studentDiet.status, "active"),
        ),
      ),
    ctx.db
      .select({ studentId: schema.studentWorkout.studentId })
      .from(schema.studentWorkout)
      .where(
        and(
          eq(schema.studentWorkout.clinicId, ctx.clinicId),
          eq(schema.studentWorkout.status, "active"),
        ),
      ),
    // Aluno-submitted check-ins the coach hasn't answered yet (feedback pending).
    ctx.db
      .select({
        id: schema.studentCheckin.id,
        studentId: schema.studentCheckin.studentId,
        date: schema.studentCheckin.date,
        weightKg: schema.studentCheckin.weightKg,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.studentCheckin)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.studentCheckin.studentId),
      )
      .where(
        and(
          eq(schema.studentCheckin.clinicId, ctx.clinicId),
          eq(schema.studentCheckin.author, "student"),
          isNull(schema.studentCheckin.feedbackAt),
        ),
      )
      .orderBy(desc(schema.studentCheckin.date))
      .limit(DASHBOARD_LIST_LIMIT),
    // Diet drafts that were never published — oldest edit first, so the queue
    // surfaces the ones the coach has genuinely forgotten.
    ctx.db
      .select({
        id: schema.studentDietVersion.id,
        studentId: schema.studentDiet.studentId,
        updatedAt: schema.studentDietVersion.updatedAt,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.studentDietVersion)
      .innerJoin(
        schema.studentDiet,
        eq(schema.studentDiet.id, schema.studentDietVersion.studentDietId),
      )
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.studentDiet.studentId),
      )
      .where(
        and(
          eq(schema.studentDiet.clinicId, ctx.clinicId),
          eq(schema.studentDietVersion.status, "draft"),
          eq(schema.students.status, "active"),
        ),
      )
      .orderBy(asc(schema.studentDietVersion.updatedAt))
      .limit(DASHBOARD_LIST_LIMIT),
    // Same, for workout drafts.
    ctx.db
      .select({
        id: schema.studentWorkoutVersion.id,
        studentId: schema.studentWorkout.studentId,
        updatedAt: schema.studentWorkoutVersion.updatedAt,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.studentWorkoutVersion)
      .innerJoin(
        schema.studentWorkout,
        eq(
          schema.studentWorkout.id,
          schema.studentWorkoutVersion.studentWorkoutId,
        ),
      )
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.studentWorkout.studentId),
      )
      .where(
        and(
          eq(schema.studentWorkout.clinicId, ctx.clinicId),
          eq(schema.studentWorkoutVersion.status, "draft"),
          eq(schema.students.status, "active"),
        ),
      )
      .orderBy(asc(schema.studentWorkoutVersion.updatedAt))
      .limit(DASHBOARD_LIST_LIMIT),
  ]);

  const hasDiet = new Set(dietRows.map((r) => r.studentId));
  const hasWorkout = new Set(workoutRows.map((r) => r.studentId));

  const missingPlans = active
    .map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      goal: s.goal,
      createdAt: s.createdAt,
      missingDiet: !hasDiet.has(s.id),
      missingWorkout: !hasWorkout.has(s.id),
    }))
    .filter((s) => s.missingDiet || s.missingWorkout)
    .slice(0, DASHBOARD_LIST_LIMIT);

  const pendingCheckins: PendingCheckin[] = pendingRows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    firstName: r.firstName,
    lastName: r.lastName,
    date: r.date,
    weightKg: r.weightKg,
  }));

  const pendingDrafts: PendingDraft[] = [
    ...dietDrafts.map((r) => ({ ...r, kind: "diet" as const })),
    ...workoutDrafts.map((r) => ({ ...r, kind: "workout" as const })),
  ]
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .slice(0, DASHBOARD_LIST_LIMIT);

  return {
    activeCount: active.length,
    missingPlans,
    pendingCheckins,
    pendingDrafts,
  };
}

export async function createStudent(
  ctx: TenantContext,
  input: StudentInput,
): Promise<Student> {
  const [student] = await ctx.db
    .insert(schema.students)
    .values({
      // clinicId always comes from the tenant context, never from the caller.
      clinicId: ctx.clinicId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      goal: input.goal ?? null,
      modality: input.modality ?? "online",
      status: input.status ?? "active",
      coachId: input.coachId ?? null,
    })
    .returning();
  return student;
}

/**
 * Updates a student's editable fields. Scoped to the clinic; returns the
 * updated row, or null when the id isn't in this clinic.
 */
export async function updateStudent(
  ctx: TenantContext,
  id: string,
  input: Partial<StudentInput>,
): Promise<Student | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.firstName !== undefined) patch.firstName = input.firstName;
  if (input.lastName !== undefined) patch.lastName = input.lastName;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.goal !== undefined) patch.goal = input.goal;
  if (input.modality !== undefined) patch.modality = input.modality;
  if (input.status !== undefined) patch.status = input.status;
  if (input.coachId !== undefined) patch.coachId = input.coachId;

  const [student] = await ctx.db
    .update(schema.students)
    .set(patch)
    .where(
      and(
        eq(schema.students.clinicId, ctx.clinicId),
        eq(schema.students.id, id),
      ),
    )
    .returning();
  return student ?? null;
}

/** Sets a student's lifecycle status (active / inactive / archived). */
export async function setStudentStatus(
  ctx: TenantContext,
  id: string,
  status: StudentStatus,
): Promise<Student | null> {
  return updateStudent(ctx, id, { status });
}

/**
 * Soft-removes a student. Deletion is never destructive — the row (and its
 * history) is kept, just hidden from the default roster.
 */
export async function archiveStudent(
  ctx: TenantContext,
  id: string,
): Promise<Student | null> {
  return setStudentStatus(ctx, id, "archived");
}

/**
 * Hard-deletes a student and everything tied to it — the destructive path for
 * plans that can't archive (Free/Solo). Tenant-scoped: only a student in this
 * clinic can be removed. In one transaction: the `students` row (its invitations
 * cascade away with it), then the aluno's login if activated (sessions/accounts
 * cascade). Returns false when the id isn't in this clinic.
 */
export async function hardDeleteStudent(
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  return ctx.db.transaction(async (tx) => {
    const [student] = await tx
      .select({ id: schema.students.id, userId: schema.students.userId })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.clinicId, ctx.clinicId),
          eq(schema.students.id, id),
        ),
      );
    if (!student) return false;

    await tx.delete(schema.students).where(eq(schema.students.id, id));
    if (student.userId) {
      await tx.delete(schema.user).where(eq(schema.user.id, student.userId));
    }
    return true;
  });
}

/**
 * Links a student row to the aluno's newly-created login and marks them active.
 * Part of the invite-accept bootstrap (no session exists yet), so it takes a
 * raw db handle and an explicit `clinicId` — which comes from the invitation,
 * never from client input — and still scopes the write by it.
 */
export async function linkStudentAccount(
  db: Database,
  args: { clinicId: string; studentId: string; userId: string },
): Promise<void> {
  await db
    .update(schema.students)
    .set({ userId: args.userId, status: "active", updatedAt: new Date() })
    .where(
      and(
        eq(schema.students.clinicId, args.clinicId),
        eq(schema.students.id, args.studentId),
      ),
    );
}
