// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { studentPortal, studentWorkouts } from "@/server/dal";
import type { WorkoutWriteInput } from "@/server/dal/workouts";
import type { WorkoutReps } from "@/lib/workouts";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The student-workout DAL (versioned treino do aluno) + the aluno portal
 * boundary. Proves draft/publish/version lifecycle, LIVE hydration (a catalog
 * change reaches an already-published version), stored custom substitutes merged
 * with live library ones, tenant/student scoping, and that the portal never
 * exposes a draft or another student's data.
 */

let db: TestDb;
let coachA: TenantContext;
let alunoA: TenantContext;
let alunoB: TenantContext;
let strangerA: TenantContext;
let studentA: string;
let supino: string;
let crucifixo: string;
let triceps: string;

const range = (...values: number[]): WorkoutReps => ({ kind: "range", values });

async function addExercise(name: string, clinicId?: string | null) {
  const [row] = await db
    .insert(schema.exercise)
    .values({
      name,
      searchText: sql`unaccent(lower(${name}))`,
      category: "strength",
      level: "beginner",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      images: [],
      clinicId: clinicId ?? null,
      source: clinicId ? "custom" : "free-exercise-db",
      code: clinicId ? null : name.toLowerCase().replace(/\s+/g, "_"),
    })
    .returning({ id: schema.exercise.id });
  return row.id;
}

function wk(name: string, withCustomSub = false): WorkoutWriteInput {
  return {
    name,
    notes: null,
    sessions: [
      {
        name: "Ficha A",
        exercises: [
          {
            exerciseId: supino,
            sets: 4,
            reps: range(8, 10),
            load: "40 kg",
            rest: 90,
            technique: "dropset",
            note: null,
            groupId: null,
            customSubstitutes: withCustomSub
              ? [{ exerciseId: triceps, note: "ombro sensível" }]
              : [],
          },
        ],
      },
    ],
  };
}

async function currentVersionId(ctx: TenantContext, studentId: string) {
  const state = await studentWorkouts.getStudentWorkoutState(ctx, studentId);
  const h = state!.history.find((w) => w.workoutId === state!.current!.workoutId)!;
  return h.versions.find((v) => v.version === state!.current!.version)!.versionId;
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "coach-a", name: "Coach A", email: "coach-a@example.com" },
    { id: "aluno-a", name: "Aluno A", email: "aluno-a@example.com" },
    { id: "coach-b", name: "Coach B", email: "coach-b@example.com" },
    { id: "aluno-b", name: "Aluno B", email: "aluno-b@example.com" },
    { id: "stranger-a", name: "Stranger", email: "stranger@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "coach-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "coach-b" })
    .returning();

  coachA = { db: db as unknown as DB, clinicId: clinicA.id, userId: "coach-a", role: "coach" };
  alunoA = { db: db as unknown as DB, clinicId: clinicA.id, userId: "aluno-a", role: "aluno" };
  alunoB = { db: db as unknown as DB, clinicId: clinicB.id, userId: "aluno-b", role: "aluno" };
  strangerA = { db: db as unknown as DB, clinicId: clinicA.id, userId: "stranger-a", role: "aluno" };

  supino = await addExercise("Supino reto");
  crucifixo = await addExercise("Crucifixo");
  triceps = await addExercise("Triceps corda");

  const [sa] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      userId: "aluno-a",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
    })
    .returning({ id: schema.students.id });
  studentA = sa.id;
  await db.insert(schema.students).values({
    clinicId: clinicB.id,
    userId: "aluno-b",
    firstName: "Bruno",
    lastName: "Costa",
    email: "bruno@example.com",
  });
});

describe("student workout DAL", () => {
  it("drafts, publishes v1, and stores custom substitutes", async () => {
    const created = await studentWorkouts.createBlankDraft(coachA, studentA, "Hipertrofia");
    expect(created.ok).toBe(true);

    let state = await studentWorkouts.getStudentWorkoutState(coachA, studentA);
    expect(state!.draft!.isNewWorkout).toBe(true);
    expect(state!.current).toBeNull();

    const pub = await studentWorkouts.publishDraft(coachA, studentA, wk("Hipertrofia", true));
    expect(pub).toMatchObject({ ok: true, version: 1 });

    state = await studentWorkouts.getStudentWorkoutState(coachA, studentA);
    expect(state!.draft).toBeNull();
    expect(state!.current!.version).toBe(1);
    const ex = state!.current!.sessions[0].exercises[0];
    expect(ex.name).toBe("Supino reto");
    expect(ex.technique).toBe("dropset");
    // The stored custom substitute is present and merged first.
    expect(ex.substitutes[0]).toMatchObject({
      source: "custom",
      name: "Triceps corda",
      note: "ombro sensível",
    });
  });

  it("rejects publishing an empty draft", async () => {
    await studentWorkouts.createBlankDraft(coachA, studentA, "Vazio");
    const pub = await studentWorkouts.publishDraft(coachA, studentA, {
      name: "Vazio",
      notes: null,
      sessions: [],
    });
    expect(pub).toEqual({ ok: false, reason: "empty" });
    await studentWorkouts.discardDraft(coachA, studentA);
  });

  it("blocks a second concurrent draft", async () => {
    await studentWorkouts.createBlankDraft(coachA, studentA, "Um");
    const second = await studentWorkouts.createBlankDraft(coachA, studentA, "Dois");
    expect(second).toEqual({ ok: false, reason: "has_draft" });
    await studentWorkouts.discardDraft(coachA, studentA);
  });

  it("reflects a live catalog substitution added after publish", async () => {
    const versionId = await currentVersionId(coachA, studentA);
    // No library sub yet for supino → only the custom one.
    let version = await studentWorkouts.getStudentWorkoutVersion(coachA, studentA, versionId);
    expect(version!.sessions[0].exercises[0].substitutes.map((s) => s.name)).toEqual([
      "Triceps corda",
    ]);

    await db.insert(schema.exerciseSubstitution).values({
      clinicId: null,
      exerciseId: supino,
      substituteExerciseId: crucifixo,
    });

    version = await studentWorkouts.getStudentWorkoutVersion(coachA, studentA, versionId);
    const names = version!.sessions[0].exercises[0].substitutes.map((s) => s.name);
    expect(names).toContain("Triceps corda"); // custom
    expect(names).toContain("Crucifixo"); // live library
  });

  it("edits the active workout into a new version and archives on a new workout", async () => {
    // Edit active → v2.
    const edit = await studentWorkouts.editActive(coachA, studentA);
    expect(edit.ok).toBe(true);
    await studentWorkouts.publishDraft(coachA, studentA, wk("Hipertrofia v2"));
    let state = await studentWorkouts.getStudentWorkoutState(coachA, studentA);
    expect(state!.current!.version).toBe(2);

    // A brand-new workout's first publish archives the previous one.
    await studentWorkouts.createBlankDraft(coachA, studentA, "Cutting força");
    await studentWorkouts.publishDraft(coachA, studentA, wk("Cutting força"));
    state = await studentWorkouts.getStudentWorkoutState(coachA, studentA);
    expect(state!.current!.workoutName).toBe("Cutting força");
    expect(state!.history.some((h) => h.status === "archived")).toBe(true);
  });
});

describe("aluno portal workout boundary", () => {
  it("shows the aluno their own published current, never a draft", async () => {
    // Open a draft — it must stay invisible to the aluno.
    await studentWorkouts.editActive(coachA, studentA);

    const state = await studentPortal.getMyWorkoutState(alunoA);
    expect(state!.current!.workoutName).toBe("Cutting força");
    // MyWorkoutStateDto has no `draft` field at all.
    expect(state).not.toHaveProperty("draft");

    await studentWorkouts.discardDraft(coachA, studentA);
  });

  it("never exposes another student's version, nor to an unlinked user", async () => {
    const versionId = await currentVersionId(coachA, studentA);
    // The aluno's own version resolves.
    expect(await studentPortal.getMyWorkoutVersion(alunoA, versionId)).not.toBeNull();
    // A different clinic's aluno and an unlinked user get null.
    expect(await studentPortal.getMyWorkoutVersion(alunoB, versionId)).toBeNull();
    expect(await studentPortal.getMyWorkoutState(strangerA)).toBeNull();
  });
});
