// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { studentWorkouts, workouts } from "@/server/dal";
import type { WorkoutWriteInput } from "@/server/dal/workouts";
import type { WorkoutReps } from "@/lib/workouts";

import { createTestDb, type TestDb } from "./pglite";

/**
 * The workout (treino) template DAL — the exercise analogue of diets. Proves
 * tenant scoping, the live exercise hydration (catalog data + library subs
 * merged with per-item custom subs), copy, and the archive/delete guard.
 */

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;
let supino: string; // base exercise
let crucifixo: string; // base exercise (a library sub for supino)
let triceps: string; // base exercise
let ownB: string; // clinic B's own exercise

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

async function addExercise(e: {
  name: string;
  clinicId?: string | null;
  instructions?: string[];
  images?: string[];
}) {
  const [row] = await db
    .insert(schema.exercise)
    .values({
      name: e.name,
      searchText: sql`unaccent(lower(${e.name}))`,
      category: "strength",
      level: "beginner",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: e.instructions ?? [],
      images: e.images ?? [],
      clinicId: e.clinicId ?? null,
      source: e.clinicId ? "custom" : "free-exercise-db",
      code: e.clinicId ? null : e.name.toLowerCase().replace(/\s+/g, "_"),
    })
    .returning({ id: schema.exercise.id });
  return row.id;
}

const range = (...values: number[]): WorkoutReps => ({ kind: "range", values });

function payload(over?: Partial<WorkoutWriteInput>): WorkoutWriteInput {
  return {
    name: "Hipertrofia",
    notes: "aquecer antes",
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
            note: "Foco na fase excêntrica.",
            groupId: null,
            customSubstitutes: [{ exerciseId: triceps, note: "ombro sensível" }],
          },
        ],
      },
    ],
    ...over,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(schema.user).values([
    { id: "user-a", name: "Coach A", email: "a@example.com" },
    { id: "user-b", name: "Coach B", email: "b@example.com" },
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

  supino = await addExercise({
    name: "Supino reto",
    instructions: ["Deite no banco", "Empurre a barra"],
    images: ["supino_reto/0.jpg"],
  });
  crucifixo = await addExercise({ name: "Crucifixo" });
  triceps = await addExercise({ name: "Triceps corda" });
  ownB = await addExercise({ name: "Exercicio B", clinicId: clinicB.id });

  // A base library substitution: crucifixo may replace supino.
  await db.insert(schema.exerciseSubstitution).values({
    clinicId: null,
    exerciseId: supino,
    substituteExerciseId: crucifixo,
  });
});

describe("workout template DAL", () => {
  it("creates a workout and hydrates it live (catalog + merged substitutes)", async () => {
    const res = await workouts.createWorkout(ctxA, payload());
    expect(res.ok).toBe(true);
    const id = (res as { ok: true; id: string }).id;

    const detail = await workouts.getWorkout(ctxA, id);
    expect(detail).not.toBeNull();
    expect(detail!.sessions).toHaveLength(1);
    const ex = detail!.sessions[0].exercises[0];
    // Live catalog data.
    expect(ex.name).toBe("Supino reto");
    expect(ex.instructions).toEqual(["Deite no banco", "Empurre a barra"]);
    expect(ex.images).toEqual(["supino_reto/0.jpg"]);
    // Prescription.
    expect(ex.sets).toBe(4);
    expect(ex.reps).toEqual({ kind: "range", values: [8, 10] });
    expect(ex.technique).toBe("dropset");
    expect(ex.note).toBe("Foco na fase excêntrica.");
    // Custom (first, with note) + library substitutes, merged.
    expect(ex.substitutes.map((s) => [s.source, s.name])).toEqual([
      ["custom", "Triceps corda"],
      ["library", "Crucifixo"],
    ]);
    expect(ex.substitutes[0].note).toBe("ombro sensível");
  });

  it("reflects a library substitution added AFTER creation (live)", async () => {
    const res = await workouts.createWorkout(ctxA, {
      ...payload(),
      sessions: [
        {
          name: "Ficha A",
          exercises: [
            {
              exerciseId: supino,
              sets: 3,
              reps: range(10, 12),
              load: null,
              rest: 60,
              technique: null,
              note: null,
              groupId: null,
              customSubstitutes: [],
            },
          ],
        },
      ],
    });
    const id = (res as { ok: true; id: string }).id;
    // Add a new library sub for supino → triceps.
    await db.insert(schema.exerciseSubstitution).values({
      clinicId: ctxA.clinicId,
      exerciseId: supino,
      substituteExerciseId: triceps,
    });
    const detail = await workouts.getWorkout(ctxA, id);
    const names = detail!.sessions[0].exercises[0].substitutes.map((s) => s.name);
    expect(names).toContain("Crucifixo");
    expect(names).toContain("Triceps corda");
  });

  it("rejects an exercise the clinic cannot see (invalid_exercise)", async () => {
    const res = await workouts.createWorkout(ctxA, {
      name: "X",
      notes: null,
      sessions: [
        {
          name: "F",
          exercises: [
            {
              exerciseId: ownB,
              sets: 3,
              reps: range(8, 10),
              load: null,
              rest: 90,
              technique: null,
              note: null,
              groupId: null,
              customSubstitutes: [],
            },
          ],
        },
      ],
    });
    expect(res).toEqual({ ok: false, reason: "invalid_exercise" });
  });

  it("copies a workout with the (cópia) suffix and its custom subs", async () => {
    const res = await workouts.createWorkout(ctxA, payload({ name: "Base" }));
    const id = (res as { ok: true; id: string }).id;
    const copy = await workouts.copyWorkout(ctxA, id);
    expect(copy.ok).toBe(true);
    const detail = await workouts.getWorkout(
      ctxA,
      (copy as { ok: true; id: string }).id,
    );
    expect(detail!.name).toBe("Base (cópia)");
    const subs = detail!.sessions[0].exercises[0].substitutes;
    // The custom sub is duplicated; library ones are live (not copied in).
    expect(subs.filter((s) => s.source === "custom")).toHaveLength(1);
  });

  it("scopes reads to the clinic (another clinic gets null)", async () => {
    const res = await workouts.createWorkout(ctxA, payload());
    const id = (res as { ok: true; id: string }).id;
    expect(await workouts.getWorkout(ctxB, id)).toBeNull();
  });

  it("guards hard-delete: archived + not referenced by a student workout", async () => {
    const res = await workouts.createWorkout(ctxA, payload({ name: "ToDelete" }));
    const id = (res as { ok: true; id: string }).id;

    // Not archived yet.
    expect(await workouts.deleteWorkout(ctxA, id)).toEqual({
      ok: false,
      reason: "not_archived",
    });

    await workouts.archiveWorkout(ctxA, id);

    // Referenced by a student workout → in_use.
    const [student] = await db
      .insert(schema.students)
      .values({
        clinicId: ctxA.clinicId,
        firstName: "Ana",
        lastName: "S",
        email: "ana@example.com",
      })
      .returning({ id: schema.students.id });
    await studentWorkouts.createFromTemplate(ctxA, student.id, id);
    expect(await workouts.deleteWorkout(ctxA, id)).toEqual({
      ok: false,
      reason: "in_use",
    });
  });
});
