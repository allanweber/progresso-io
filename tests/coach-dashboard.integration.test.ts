// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import type { TenantContext } from "@/server/tenant";
import { EMPTY_STRUCTURE as EMPTY_DIET } from "@/lib/student-diets";
import { EMPTY_STRUCTURE as EMPTY_WORKOUT } from "@/lib/student-workouts";
import { students as studentsDal } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let ctx: TenantContext;
let ctxB: TenantContext;

const password = "supersegura123";

async function coachContext(email: string, name: string): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  return {
    db: db as unknown as DB,
    clinicId: user.clinicId!,
    userId: user.id,
    role: "coach",
  };
}

/** Marks a student as having a published diet (an `active` student_diet). */
async function giveActiveDiet(c: TenantContext, studentId: string) {
  await db
    .insert(schema.studentDiet)
    .values({ clinicId: c.clinicId, studentId, name: "Dieta", status: "active" });
}

/** Marks a student as having a published workout (an `active` student_workout). */
async function giveActiveWorkout(c: TenantContext, studentId: string) {
  await db.insert(schema.studentWorkout).values({
    clinicId: c.clinicId,
    studentId,
    name: "Treino",
    status: "active",
  });
}

/**
 * Gives a student a diet carrying one version in `status`. Returns the version
 * id so a test can assert on exactly that row.
 */
async function giveDietVersion(
  c: TenantContext,
  studentId: string,
  status: "draft" | "published",
  updatedAt?: Date,
) {
  const [d] = await db
    .insert(schema.studentDiet)
    .values({
      clinicId: c.clinicId,
      studentId,
      name: "Dieta",
      status: status === "draft" ? "draft" : "active",
    })
    .returning();
  const [v] = await db
    .insert(schema.studentDietVersion)
    .values({
      studentDietId: d.id,
      status,
      version: status === "published" ? 1 : null,
      tree: EMPTY_DIET,
      ...(updatedAt ? { updatedAt } : {}),
    })
    .returning();
  return v.id;
}

/** Same, for a workout draft. */
async function giveWorkoutDraft(c: TenantContext, studentId: string) {
  const [w] = await db
    .insert(schema.studentWorkout)
    .values({ clinicId: c.clinicId, studentId, name: "Treino", status: "draft" })
    .returning();
  const [v] = await db
    .insert(schema.studentWorkoutVersion)
    .values({ studentWorkoutId: w.id, status: "draft", tree: EMPTY_WORKOUT })
    .returning();
  return v.id;
}

async function addStudent(c: TenantContext, firstName: string) {
  return studentsDal.createStudent(c, {
    firstName,
    lastName: "Aluno",
    modality: "online",
    coachId: c.userId,
  });
}

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
  ctx = await coachContext("coach-a@example.com", "Coach A");
  ctxB = await coachContext("coach-b@example.com", "Coach B");
});

describe("getCoachDashboard", () => {
  it("counts active students and lists those missing a treino or dieta", async () => {
    // Created oldest → newest, so newest-first ordering puts s3 before s2.
    const s1 = await addStudent(ctx, "Completo"); // diet + workout → not listed
    const s2 = await addStudent(ctx, "SoTreino"); // has diet, no workout
    const s3 = await addStudent(ctx, "SemNada"); // neither

    // An inactive student with no plans must not count nor be listed.
    const s4 = await addStudent(ctx, "Inativo");
    await studentsDal.setStudentStatus(ctx, s4.id, "inactive");

    // Stagger createdAt explicitly: rapid inserts can share a millisecond, which
    // makes the `created_at desc` newest-first ordering tie-break randomly (UUID
    // ids aren't monotonic). Fixed timestamps keep s3 strictly newer than s2.
    const baseMs = Date.UTC(2026, 0, 1);
    for (const [i, s] of [s1, s2, s3, s4].entries()) {
      await db
        .update(schema.students)
        .set({ createdAt: new Date(baseMs + i * 60_000) })
        .where(eq(schema.students.id, s.id));
    }

    await giveActiveDiet(ctx, s1.id);
    await giveActiveWorkout(ctx, s1.id);
    await giveActiveDiet(ctx, s2.id);

    const dash = await studentsDal.getCoachDashboard(ctx);

    expect(dash.activeCount).toBe(3); // s1, s2, s3 (not the inactive s4)

    // Newest-first: s3 then s2. s1 (complete) and s4 (inactive) are absent.
    expect(dash.missingPlans.map((p) => p.id)).toEqual([s3.id, s2.id]);

    const bySemNada = dash.missingPlans.find((p) => p.id === s3.id)!;
    expect(bySemNada.missingDiet).toBe(true);
    expect(bySemNada.missingWorkout).toBe(true);

    const bySoTreino = dash.missingPlans.find((p) => p.id === s2.id)!;
    expect(bySoTreino.missingDiet).toBe(false); // has the diet
    expect(bySoTreino.missingWorkout).toBe(true);
  });

  it("is tenant-scoped: never counts or lists another clinic's students", async () => {
    await addStudent(ctxB, "Estranho"); // clinic B, no plans

    const dashB = await studentsDal.getCoachDashboard(ctxB);
    expect(dashB.activeCount).toBe(1);
    expect(dashB.missingPlans).toHaveLength(1);

    // Clinic A is unchanged by clinic B's student.
    const dashA = await studentsDal.getCoachDashboard(ctx);
    expect(dashA.activeCount).toBe(3);
    expect(dashA.missingPlans.every((p) => p.id !== undefined)).toBe(true);
  });
});

describe("getCoachDashboard — pendingDrafts", () => {
  it("lists never-published drafts, oldest edit first, and ignores published versions", async () => {
    const ctxC = await coachContext("coach-c@example.com", "Coach C");
    const s1 = await addStudent(ctxC, "ComRascunho");
    const s2 = await addStudent(ctxC, "Publicado");
    const s3 = await addStudent(ctxC, "TreinoRascunho");

    // Two drafts with a deliberate age gap, plus one published version that
    // must never appear — publishing is exactly what takes it off the queue.
    const older = await giveDietVersion(
      ctxC,
      s1.id,
      "draft",
      new Date(Date.UTC(2026, 0, 1)),
    );
    await giveDietVersion(ctxC, s2.id, "published");
    const newer = await giveWorkoutDraft(ctxC, s3.id);

    const dash = await studentsDal.getCoachDashboard(ctxC);
    const ids = dash.pendingDrafts.map((d) => d.id);

    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(dash.pendingDrafts).toHaveLength(2);

    // Oldest edit first — the draft the coach has most forgotten.
    expect(ids[0]).toBe(older);

    const draft = dash.pendingDrafts.find((d) => d.id === older)!;
    expect(draft.kind).toBe("diet");
    expect(draft.studentId).toBe(s1.id);
    expect(draft.firstName).toBe("ComRascunho");

    expect(dash.pendingDrafts.find((d) => d.id === newer)!.kind).toBe("workout");
  });

  it("is tenant-scoped: never surfaces another clinic's drafts", async () => {
    const ctxD = await coachContext("coach-d@example.com", "Coach D");
    const outsider = await addStudent(ctxD, "DeOutraClinica");
    await giveDietVersion(ctxD, outsider.id, "draft");

    // Clinic D sees its own draft...
    expect((await studentsDal.getCoachDashboard(ctxD)).pendingDrafts).toHaveLength(1);
    // ...and clinic A, which has none of its own, sees nothing.
    expect((await studentsDal.getCoachDashboard(ctx)).pendingDrafts).toEqual([]);
  });
});
