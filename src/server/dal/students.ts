import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";

import { type DB, schema } from "@/db";
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
};

/** The real (data-backed) part of the coach dashboard. */
export type CoachDashboard = {
  activeCount: number;
  missingPlans: MissingPlanStudent[];
};

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
  const [active, dietRows, workoutRows] = await Promise.all([
    ctx.db
      .select({
        id: schema.students.id,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        goal: schema.students.goal,
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
  ]);

  const hasDiet = new Set(dietRows.map((r) => r.studentId));
  const hasWorkout = new Set(workoutRows.map((r) => r.studentId));

  const missingPlans = active
    .map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      goal: s.goal,
      missingDiet: !hasDiet.has(s.id),
      missingWorkout: !hasWorkout.has(s.id),
    }))
    .filter((s) => s.missingDiet || s.missingWorkout);

  return { activeCount: active.length, missingPlans };
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
 * Links a student row to the aluno's newly-created login and marks them active.
 * Part of the invite-accept bootstrap (no session exists yet), so it takes a
 * raw db handle and an explicit `clinicId` — which comes from the invitation,
 * never from client input — and still scopes the write by it.
 */
export async function linkStudentAccount(
  db: DB,
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
