// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { OpenGymExportResponse } from "@/lib/opengym-plan";
import type { TenantContext } from "@/server/tenant";
import { studentWorkouts, workouts } from "@/server/dal";
import { detailToWriteInput, type WorkoutExerciseInput } from "@/server/dal/workouts";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;
let workoutId: string;
let exported: OpenGymExportResponse;
let studentId: string;
let studentVersionId: string;

const ids: Record<string, string> = {};
const NOW = new Date("2026-10-28T15:00:00Z");

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

async function addExercise(
  key: string,
  e: {
    name: string;
    openGymId?: string;
    clinicId?: string;
    description?: string;
    primaryMuscles?: schema.Muscle[];
    secondaryMuscles?: schema.Muscle[];
    equipment?: schema.ExerciseEquipment;
    instructions?: string[];
  },
) {
  const [row] = await db
    .insert(schema.exercise)
    .values({
      name: e.name,
      searchText: sql`unaccent(lower(${e.name}))`,
      category: "strength",
      level: "beginner",
      equipment: e.equipment ?? null,
      primaryMuscles: e.primaryMuscles ?? ["chest"],
      secondaryMuscles: e.secondaryMuscles ?? [],
      instructions: e.instructions ?? [],
      description: e.description ?? null,
      clinicId: e.clinicId ?? null,
      openGymId: e.openGymId ?? null,
      code: e.clinicId ? null : key,
      source: e.clinicId ? "custom" : "free-exercise-db",
    })
    .returning({ id: schema.exercise.id });
  ids[key] = row.id;
}

function item(key: string, over: Partial<WorkoutExerciseInput> = {}): WorkoutExerciseInput {
  return {
    exerciseId: ids[key],
    sets: 3,
    reps: { kind: "fixed", value: 10 },
    load: null,
    rest: 60,
    note: null,
    technique: null,
    groupId: null,
    customSubstitutes: [],
    ...over,
  };
}

function exerciseAt(session: number, index: number) {
  return exported.plan.routines[session].ex[index];
}

function summaryFor(name: string) {
  return exported.summary.exercises.find((e) => e.exercise === name)?.items ?? [];
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "user-a", name: "Coach A", email: "a@example.com" },
    { id: "user-b", name: "Coach B", email: "b@example.com" },
    { id: "aluno-a", name: "Ana", email: "ana@example.com" },
  ]);
  const [clinicA] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "user-a" })
    .returning();
  const [clinicB] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic B", ownerUserId: "user-b" })
    .returning();
  ctxA = ctxFor(clinicA.id, "user-a");
  ctxB = ctxFor(clinicB.id, "user-b");

  await addExercise("supino", { name: "Supino reto", openGymId: "0025" });
  await addExercise("crucifixo", { name: "Crucifixo", openGymId: "0308" });
  await addExercise("agachamento", {
    name: "Agachamento",
    openGymId: "0043",
    primaryMuscles: ["quadriceps"],
  });
  await addExercise("legpress", { name: "Leg press", openGymId: "0739" });
  await addExercise("remada", { name: "Remada", openGymId: "0027" });
  await addExercise("puxada", { name: "Puxada", openGymId: "0150" });
  await addExercise("rosca", { name: "Rosca", openGymId: "0031" });
  await addExercise("prancha", { name: "Prancha", openGymId: "0464" });
  await addExercise("triceps", { name: "Tríceps", openGymId: "0200" });
  await addExercise("elevacao", { name: "Elevação lateral", openGymId: "0334" });
  await addExercise("semId", {
    name: "Remada cavalinho",
    primaryMuscles: ["middle_back"],
    secondaryMuscles: ["biceps", "lats"],
    equipment: "barbell",
    instructions: ["Incline o tronco.", "Puxe a barra."],
  });
  await addExercise("proprio", {
    name: "Exercício da clínica",
    clinicId: clinicA.id,
    description: "Movimento próprio do coach.",
    primaryMuscles: ["glutes"],
    equipment: "machine",
  });
  await addExercise("subSemId", { name: "Pullover na máquina" });

  await db.insert(schema.exerciseSubstitution).values([
    { clinicId: null, exerciseId: ids.supino, substituteExerciseId: ids.crucifixo },
    { clinicId: null, exerciseId: ids.supino, substituteExerciseId: ids.subSemId },
  ]);

  const res = await workouts.createWorkout(ctxA, {
    name: "Hipertrofia Força",
    notes: "Aquecer antes.",
    cardio: "20 min de esteira",
    sessions: [
      {
        name: "Ficha A",
        exercises: [
          item("supino", {
            reps: { kind: "range", values: [8, 12] },
            load: "40 kg",
            rest: 90,
            note: "Desça devagar.",
            technique: "dropset",
            customSubstitutes: [{ exerciseId: ids.triceps, note: null }],
          }),
          item("crucifixo", {
            reps: { kind: "pyramid", values: [12, 10, 8, 6] },
            load: "90 lb",
            technique: "tripledrop",
          }),
          item("agachamento", { load: "70% 1RM", technique: "restpause" }),
          item("legpress", { reps: { kind: "failure" }, technique: "gvt" }),
        ],
      },
      {
        name: "Ficha B",
        exercises: [
          item("remada", { rest: 0, technique: "superset", groupId: "g1" }),
          item("puxada", { technique: "superset", groupId: "g1" }),
          item("rosca", {
            reps: { kind: "range", values: [10, 8, 6] },
            technique: "fs7",
          }),
          item("prancha", { reps: { kind: "duration", seconds: 45 }, technique: "cluster" }),
          item("semId"),
          item("proprio", { load: "peso corporal" }),
          item("elevacao", { technique: "giant", groupId: "g2" }),
        ],
      },
    ],
  });
  if (!res.ok) throw new Error("workout not created");
  workoutId = res.id;
  exported = (await workouts.exportOpenGymPlan(ctxA, workoutId, NOW))!;

  const [student] = await db
    .insert(schema.students)
    .values({
      clinicId: clinicA.id,
      userId: "aluno-a",
      firstName: "Ana",
      lastName: "Silva",
      email: "ana@example.com",
    })
    .returning({ id: schema.students.id });
  studentId = student.id;
  const draft = await studentWorkouts.createFromTemplate(ctxA, studentId, workoutId);
  if (!draft.ok) throw new Error("student draft not created");
  const template = await workouts.getWorkout(ctxA, workoutId);
  const published = await studentWorkouts.publishDraft(
    ctxA,
    studentId,
    detailToWriteInput(template!.name, template!.notes, template!.cardio, template!.sessions),
  );
  if (!published.ok) throw new Error("student workout not published");
  const state = await studentWorkouts.getStudentWorkoutState(ctxA, studentId);
  studentVersionId = state!.current!.versionId;
});

describe("openGym plan export", () => {
  it("writes an openGym plan file named after the workout", () => {
    expect(exported.fileName).toBe("hipertrofia-forca.opengym.json");
    expect(exported.plan).toMatchObject({
      opengym_plan: 1,
      exported: "2026-10-28",
      name: "Hipertrofia Força",
      unit: "kg",
      week: {},
    });
  });

  it("turns each session into a routine, keeping names and exercise order", () => {
    expect(exported.plan.routines.map((r) => r.name)).toEqual(["Ficha A", "Ficha B"]);
    expect(exported.plan.routines[0].ex.map((e) => e.id)).toEqual([
      "0025",
      "0308",
      "0043",
      "0739",
    ]);
    expect(exported.plan.routines[1].ex.map((e) => e.id)).toEqual([
      "0027",
      "0150",
      "0031",
      "0464",
      `progresso-${ids.semId}`,
      `progresso-${ids.proprio}`,
      "0334",
    ]);
  });

  it("exports a rep range, kg load, rest, observação, drop set and openGym substitutes", () => {
    expect(exerciseAt(0, 0)).toEqual({
      id: "0025",
      sets: 3,
      reps: 12,
      repsMin: 8,
      weight: 40,
      restSec: 90,
      note: "Desça devagar.",
      intensifier: { type: "dropset", count: 1, pct: 20 },
      subs: ["0200", "0308"],
    });
    expect(summaryFor("Supino reto")).toEqual([
      "Substituto sem equivalente no openGym: Pullover na máquina.",
    ]);
  });

  it("exports a pyramid with its sets and converts a lb load to the file unit", () => {
    expect(exerciseAt(0, 1)).toMatchObject({
      sets: 4,
      pyramid: [12, 10, 8, 6],
      weight: 40.82,
      intensifier: { type: "dropset", count: 3, pct: 20 },
    });
    expect(summaryFor("Crucifixo")).toContain("Carga convertida de 90 lb para 40.82 kg.");
  });

  it("keeps an unrepresentable load in the note and exports rest-pause", () => {
    expect(exerciseAt(0, 2)).toMatchObject({
      reps: 10,
      note: "Carga: 70% 1RM",
      intensifier: { type: "restpause", totalReps: 10, restSec: 15 },
    });
    expect(exerciseAt(0, 2).weight).toBeUndefined();
  });

  it("exports falha as to-failure and writes GVT into the note", () => {
    const e = exerciseAt(0, 3);
    expect(e.lastToFailure).toBe(true);
    expect(e.reps).toBeUndefined();
    expect(e.note).toBe("Todas as séries até a falha · Técnica: GVT 10×10");
  });

  it("exports rest 0 as no timer and a super-set group as one openGym superset", () => {
    expect(exerciseAt(1, 0)).toMatchObject({ restOff: true, sg: "sg1" });
    expect(exerciseAt(1, 0).restSec).toBeUndefined();
    expect(exerciseAt(1, 1).sg).toBe("sg1");
    expect(exerciseAt(1, 6).sg).toBe("sg2");
  });

  it("writes FS7 and cluster into the note and exports a duração as a timed hold", () => {
    expect(exerciseAt(1, 2)).toMatchObject({
      reps: 10,
      repsMin: 6,
      note: "Repetições: 10-8-6 · Técnica: FS7",
    });
    expect(exerciseAt(1, 3)).toMatchObject({
      mode: "time",
      sec: 45,
      note: "Técnica: Cluster",
    });
  });

  it("exports exercises without an openGym id as openGym custom exercises", () => {
    expect(exported.plan.customEx).toEqual([
      {
        id: `progresso-${ids.semId}`,
        n: "Remada cavalinho",
        bp: "back",
        eq: "barbell",
        tg: "upper-back",
        primaries: ["upper-back"],
        secondaries: ["biceps"],
        muscleGroups: ["upper-back", "biceps"],
        desc: "Incline o tronco.\nPuxe a barra.",
      },
      {
        id: `progresso-${ids.proprio}`,
        n: "Exercício da clínica",
        bp: "upper legs",
        eq: "leverage machine",
        tg: "gluteal",
        primaries: ["gluteal"],
        muscleGroups: ["gluteal"],
        desc: "Movimento próprio do coach.",
      },
    ]);
    expect(exported.summary.customExercises).toEqual([
      "Remada cavalinho",
      "Exercício da clínica",
    ]);
    expect(exerciseAt(1, 5).note).toBe("Carga: peso corporal");
  });

  it("lists what the file could not carry at the workout level", () => {
    expect(exported.summary.workout).toEqual([
      "Observações do treino não exportadas.",
      "Cardio não exportado: 20 min de esteira",
    ]);
  });

  it("exports an archived workout", async () => {
    expect(await workouts.archiveWorkout(ctxA, workoutId)).toBe(true);
    const again = await workouts.exportOpenGymPlan(ctxA, workoutId, NOW);
    expect(again?.plan.routines).toHaveLength(2);
  });

  it("never exports another clinic's workout", async () => {
    expect(await workouts.exportOpenGymPlan(ctxB, workoutId, NOW)).toBeNull();
  });
});

describe("openGym plan export of an aluno's workout version", () => {
  it("exports the published version like the workout it came from", async () => {
    const res = await studentWorkouts.exportOpenGymPlan(ctxA, studentId, studentVersionId, NOW);
    expect(res?.fileName).toBe("hipertrofia-forca.opengym.json");
    expect(res?.plan.routines.map((r) => r.ex)).toEqual(
      exported.plan.routines.map((r) => r.ex),
    );
    expect(res?.plan.customEx).toEqual(exported.plan.customEx);
    expect(res?.summary).toEqual(exported.summary);
  });

  it("never exports another clinic's aluno workout", async () => {
    expect(
      await studentWorkouts.exportOpenGymPlan(ctxB, studentId, studentVersionId, NOW),
    ).toBeNull();
  });
});
