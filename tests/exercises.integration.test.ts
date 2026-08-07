// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { exercises } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

/** Inserts an exercise, computing search_text via unaccent(lower()) like the seed. */
async function addExercise(e: {
  code?: string | null;
  name: string;
  category?: schema.ExerciseCategory;
  level?: schema.ExerciseLevel;
  force?: schema.ExerciseForce | null;
  mechanic?: schema.ExerciseMechanic | null;
  equipment?: schema.ExerciseEquipment | null;
  primaryMuscles?: schema.Muscle[];
  secondaryMuscles?: schema.Muscle[];
  instructions?: string[];
  images?: string[];
  clinicId?: string | null;
  archived?: boolean;
}) {
  const [row] = await db
    .insert(schema.exercise)
    .values({
      code: e.code ?? null,
      name: e.name,
      searchText: sql`unaccent(lower(${e.name}))`,
      category: e.category ?? "strength",
      level: e.level ?? "beginner",
      force: e.force ?? null,
      mechanic: e.mechanic ?? null,
      equipment: e.equipment ?? null,
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
      instructions: e.instructions ?? [],
      images: e.images ?? [],
      clinicId: e.clinicId ?? null,
      archived: e.archived ?? false,
    })
    .returning({ id: schema.exercise.id });
  return row.id;
}

function ctxFor(clinicId: string, userId: string): TenantContext {
  return { db: db as unknown as DB, clinicId, userId, role: "coach" };
}

let agachamentoId: string;
let clinicBExerciseId: string;

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

  // Base catalog (clinicId null).
  agachamentoId = await addExercise({
    code: "Barbell_Squat",
    name: "Agachamento com barra",
    category: "strength",
    level: "intermediate",
    force: "push",
    mechanic: "compound",
    equipment: "barbell",
    primaryMuscles: ["quadriceps"],
    secondaryMuscles: ["glutes", "hamstrings"],
    instructions: ["Posicione a barra.", "Agache.", "Suba."],
    images: ["Barbell_Squat/0.jpg", "Barbell_Squat/1.jpg"],
  });
  await addExercise({
    code: "Running",
    name: "Corrida",
    category: "cardio",
    level: "beginner",
    equipment: null,
    primaryMuscles: ["quadriceps"],
  });
  await addExercise({
    code: "Archived_Move",
    name: "Exercício arquivado",
    archived: true,
  });

  // Custom exercises.
  await addExercise({
    name: "Rosca própria da clínica A",
    category: "strength",
    equipment: "dumbbell",
    primaryMuscles: ["biceps"],
    clinicId: ctxA.clinicId,
  });
  clinicBExerciseId = await addExercise({
    name: "Prancha própria da clínica B",
    category: "strength",
    primaryMuscles: ["abdominals"],
    clinicId: ctxB.clinicId,
  });

  // Base substitution: Corrida can replace Agachamento (a base rule, clinic null).
  const [corrida] = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(sql`${schema.exercise.code} = 'Running'`);
  await db.insert(schema.exerciseSubstitution).values({
    clinicId: null,
    exerciseId: agachamentoId,
    substituteExerciseId: corrida.id,
  });
});

describe("exercises DAL", () => {
  it("lists base + own custom, excluding archived and other clinics", async () => {
    const { items, total } = await exercises.listExercises(ctxA, {
      pageSize: 100,
    });
    const names = items.map((i) => i.name);
    expect(names).toContain("Agachamento com barra");
    expect(names).toContain("Corrida");
    expect(names).toContain("Rosca própria da clínica A");
    expect(names).not.toContain("Prancha própria da clínica B");
    expect(names).not.toContain("Exercício arquivado");
    expect(total).toBe(3);
  });

  it("marks origin base vs clinic and exposes a thumbnail", async () => {
    const { items } = await exercises.listExercises(ctxA, { pageSize: 100 });
    const squat = items.find((i) => i.name.startsWith("Agachamento"))!;
    const rosca = items.find((i) => i.name.startsWith("Rosca"))!;
    expect(squat.origin).toBe("base");
    expect(squat.thumbnail).toBe("Barbell_Squat/0.jpg");
    expect(rosca.origin).toBe("clinic");
    expect(rosca.thumbnail).toBeNull();
  });

  it("searches accent- and case-insensitively", async () => {
    const hit = await exercises.listExercises(ctxA, { search: "exercicio" });
    // "Exercício arquivado" is archived, so a plain search finds nothing here…
    expect(hit.items).toHaveLength(0);
    const squat = await exercises.listExercises(ctxA, { search: "AGACHAMENTO" });
    expect(squat.items.map((i) => i.name)).toContain("Agachamento com barra");
  });

  it("filters by category, level, equipment and muscle", async () => {
    const cardio = await exercises.listExercises(ctxA, {
      category: "cardio",
      pageSize: 100,
    });
    expect(cardio.items.map((i) => i.name)).toEqual(["Corrida"]);

    const intermediate = await exercises.listExercises(ctxA, {
      level: "intermediate",
      pageSize: 100,
    });
    expect(intermediate.items.map((i) => i.name)).toEqual([
      "Agachamento com barra",
    ]);

    const barbell = await exercises.listExercises(ctxA, {
      equipment: "barbell",
      pageSize: 100,
    });
    expect(barbell.items.map((i) => i.name)).toEqual(["Agachamento com barra"]);

    // Secondary muscles count: the squat targets glutes as a secondary muscle.
    const glutes = await exercises.listExercises(ctxA, {
      muscle: "glutes",
      pageSize: 100,
    });
    expect(glutes.items.map((i) => i.name)).toEqual(["Agachamento com barra"]);

    // Biceps is only the clinic A custom exercise (own), never clinic B's.
    const biceps = await exercises.listExercises(ctxA, {
      muscle: "biceps",
      pageSize: 100,
    });
    expect(biceps.items.map((i) => i.name)).toEqual(["Rosca própria da clínica A"]);
  });

  it("paginates", async () => {
    const firstPage = await exercises.listExercises(ctxA, {
      pageSize: 1,
      page: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(3);
  });

  it("returns a full detail for a visible exercise, with substitutes", async () => {
    const detail = await exercises.getExercise(ctxA, agachamentoId);
    expect(detail).not.toBeNull();
    expect(detail!.origin).toBe("base");
    expect(detail!.primaryMuscles).toEqual(["quadriceps"]);
    expect(detail!.secondaryMuscles).toEqual(["glutes", "hamstrings"]);
    expect(detail!.instructions).toHaveLength(3);
    expect(detail!.images).toEqual([
      "Barbell_Squat/0.jpg",
      "Barbell_Squat/1.jpg",
    ]);
    // The seeded base substitution surfaces on the detail.
    expect(detail!.substitutes).toHaveLength(1);
    expect(detail!.substitutes[0]).toMatchObject({
      name: "Corrida",
      origin: "base",
    });
  });

  it("shows base substitutions to every clinic", async () => {
    // The açaí→arroz-style base rule (clinic null) is visible to clinic B too.
    const detailB = await exercises.getExercise(ctxB, agachamentoId);
    expect(detailB!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);
  });

  it("does not leak another clinic's custom exercise from getExercise", async () => {
    expect(await exercises.getExercise(ctxA, clinicBExerciseId)).toBeNull();
    // The owning clinic can read it.
    expect(await exercises.getExercise(ctxB, clinicBExerciseId)).not.toBeNull();
  });

  it("marks base rules as read-only (not removable) for a clinic", async () => {
    const detail = await exercises.getExercise(ctxA, agachamentoId);
    const corrida = detail!.substitutes.find((s) => s.name === "Corrida")!;
    expect(corrida.removable).toBe(false);
    // A base rule can't be removed via the clinic-scoped delete.
    expect(
      await exercises.removeExerciseSubstitution(ctxA, agachamentoId, corrida.id),
    ).toBe(false);
  });

  it("lets a coach add and remove its own clinic substitution", async () => {
    const [rosca] = await db
      .select({ id: schema.exercise.id })
      .from(schema.exercise)
      .where(sql`${schema.exercise.name} = 'Rosca própria da clínica A'`);

    const added = await exercises.addExerciseSubstitution(
      ctxA,
      agachamentoId,
      rosca.id,
    );
    expect(added.ok).toBe(true);
    const ruleId = (added as { ok: true; substitute: { id: string } }).substitute
      .id;

    // The coach now sees base (Corrida, read-only) + its own (Rosca, removable).
    const detailA = await exercises.getExercise(ctxA, agachamentoId);
    const rows = Object.fromEntries(
      detailA!.substitutes.map((s) => [s.name, s.removable]),
    );
    expect(rows["Corrida"]).toBe(false);
    expect(rows["Rosca própria da clínica A"]).toBe(true);

    // Clinic B never sees clinic A's own rule (only the base one).
    const detailB = await exercises.getExercise(ctxB, agachamentoId);
    expect(detailB!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);

    // Self + duplicate rejected.
    expect(
      await exercises.addExerciseSubstitution(ctxA, agachamentoId, agachamentoId),
    ).toEqual({ ok: false, reason: "same_exercise" });
    expect(
      await exercises.addExerciseSubstitution(ctxA, agachamentoId, rosca.id),
    ).toEqual({ ok: false, reason: "duplicate" });

    // The owner removes its own rule; another clinic cannot.
    expect(
      await exercises.removeExerciseSubstitution(ctxB, agachamentoId, ruleId),
    ).toBe(false);
    expect(
      await exercises.removeExerciseSubstitution(ctxA, agachamentoId, ruleId),
    ).toBe(true);
    const after = await exercises.getExercise(ctxA, agachamentoId);
    expect(after!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);
  });

  it("refuses to add a substitution against another clinic's exercise", async () => {
    // clinicBExerciseId isn't visible to clinic A → exercise_not_found.
    expect(
      await exercises.addExerciseSubstitution(
        ctxA,
        clinicBExerciseId,
        agachamentoId,
      ),
    ).toEqual({ ok: false, reason: "exercise_not_found" });
    // And it can't be used as a substitute either.
    expect(
      await exercises.addExerciseSubstitution(
        ctxA,
        agachamentoId,
        clinicBExerciseId,
      ),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
  });
});
