// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { TenantContext } from "@/server/tenant";
import { exercises } from "@/server/dal";

import { exerciseInput, exerciseRow, type ExerciseSeed } from "./exercise-fixture";
import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

async function addExercise(e: ExerciseSeed) {
  const [row] = await db
    .insert(schema.exercise)
    .values(exerciseRow(e))
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

  agachamentoId = await addExercise({
    code: "0043",
    name: "Agachamento com barra",
    nameEn: "Barbell full squat",
    bodyPart: "upper legs",
    category: "strength",
    equipment: "barbell",
    target: "quads",
    secondaryMuscles: ["glutes", "hamstrings"],
    mapPrimary: ["quadriceps"],
    mapSecondary: ["gluteal", "hamstring"],
    muscleWeights: { quadriceps: 1, gluteal: 0.4, hamstring: 0.4 },
    instructions: ["Posicione a barra.", "Agache.", "Suba."],
    image: "still/0043.webp",
    video: "clip/0043.mp4",
    femaleImage: "still/2500.webp",
    femaleVideo: "clip/2500.mp4",
  });
  await addExercise({
    code: "0685",
    name: "Corrida",
    bodyPart: "cardio",
    category: "cardio",
    equipment: "body weight",
    target: "cardiovascular system",
  });
  await addExercise({
    code: "0001",
    name: "Exercício arquivado",
    archived: true,
  });

  await addExercise({
    name: "Rosca própria da clínica A",
    source: "custom",
    bodyPart: "upper arms",
    equipment: "dumbbell",
    target: "biceps",
    clinicId: ctxA.clinicId,
  });
  clinicBExerciseId = await addExercise({
    name: "Prancha própria da clínica B",
    source: "custom",
    bodyPart: "waist",
    target: "abs",
    clinicId: ctxB.clinicId,
  });

  const [corrida] = await db
    .select({ id: schema.exercise.id })
    .from(schema.exercise)
    .where(sql`${schema.exercise.code} = '0685'`);
  await db.insert(schema.exerciseSubstitution).values({
    clinicId: null,
    exerciseId: agachamentoId,
    substituteExerciseId: corrida.id,
  });
});

describe("exercises DAL", () => {
  it("lists base + own custom, excluding archived and other clinics", async () => {
    const { items, total, counts } = await exercises.listExercises(ctxA, {
      pageSize: 100,
    });
    const names = items.map((i) => i.name);
    expect(names).toContain("Agachamento com barra");
    expect(names).toContain("Corrida");
    expect(names).toContain("Rosca própria da clínica A");
    expect(names).not.toContain("Prancha própria da clínica B");
    expect(names).not.toContain("Exercício arquivado");
    expect(total).toBe(3);
    expect(counts).toEqual({ base: 2, clinic: 1 });
  });

  it("marks origin base vs clinic and exposes the still image", async () => {
    const { items } = await exercises.listExercises(ctxA, { pageSize: 100 });
    const squat = items.find((i) => i.name.startsWith("Agachamento"))!;
    const rosca = items.find((i) => i.name.startsWith("Rosca"))!;
    expect(squat.origin).toBe("base");
    expect(squat.image).toBe("still/0043.webp");
    expect(squat.target).toBe("quads");
    expect(rosca.origin).toBe("clinic");
    expect(rosca.image).toBeNull();
  });

  it("searches accent- and case-insensitively", async () => {
    const hit = await exercises.listExercises(ctxA, { search: "exercicio" });
    expect(hit.items).toHaveLength(0);
    const squat = await exercises.listExercises(ctxA, { search: "AGACHAMENTO" });
    expect(squat.items.map((i) => i.name)).toContain("Agachamento com barra");
  });

  it("searches the PT-BR and the English name at the same time", async () => {
    for (const search of ["barbell squat", "SQUAT", "agachamento barbell"]) {
      const result = await exercises.listExercises(ctxA, { search });
      expect(result.items.map((i) => i.name)).toEqual(["Agachamento com barra"]);
      expect(result.items[0].nameEn).toBe("Barbell full squat");
    }
  });

  it("filters by body part, category, equipment and target", async () => {
    const cardio = await exercises.listExercises(ctxA, { category: "cardio" });
    expect(cardio.items.map((i) => i.name)).toEqual(["Corrida"]);

    const legs = await exercises.listExercises(ctxA, { bodyPart: "upper legs" });
    expect(legs.items.map((i) => i.name)).toEqual(["Agachamento com barra"]);

    const barbell = await exercises.listExercises(ctxA, { equipment: "barbell" });
    expect(barbell.items.map((i) => i.name)).toEqual(["Agachamento com barra"]);

    const biceps = await exercises.listExercises(ctxA, { target: "biceps" });
    expect(biceps.items.map((i) => i.name)).toEqual(["Rosca própria da clínica A"]);
  });

  it("returns the facets that still have results for the other filters", async () => {
    const all = await exercises.listExercises(ctxA, {});
    expect(all.facets.categories.sort()).toEqual(["cardio", "strength"]);
    expect(all.facets.equipment.sort()).toEqual(["barbell", "body weight", "dumbbell"]);

    const cardio = await exercises.listExercises(ctxA, { category: "cardio" });
    expect(cardio.facets.categories.sort()).toEqual(["cardio", "strength"]);
    expect(cardio.facets.equipment).toEqual(["body weight"]);

    const legs = await exercises.listExercises(ctxA, { bodyPart: "upper legs" });
    expect(legs.facets.equipment).toEqual(["barbell"]);
  });

  it("paginates", async () => {
    const firstPage = await exercises.listExercises(ctxA, { pageSize: 1, page: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBe(3);
  });

  it("returns a full detail for a visible exercise, with media and substitutes", async () => {
    const detail = await exercises.getExercise(ctxA, agachamentoId);
    expect(detail).not.toBeNull();
    expect(detail!.origin).toBe("base");
    expect(detail!.mapPrimary).toEqual(["quadriceps"]);
    expect(detail!.secondaryMuscles).toEqual(["glutes", "hamstrings"]);
    expect(detail!.instructions).toHaveLength(3);
    expect(detail!.video).toBe("clip/0043.mp4");
    expect(detail!.femaleVideo).toBe("clip/2500.mp4");
    expect(detail!.substitutes).toHaveLength(1);
    expect(detail!.substitutes[0]).toMatchObject({ name: "Corrida", origin: "base" });

    const dto = exercises.exerciseDetailDto(detail!);
    expect(dto).toMatchObject({ code: "0043", image: "still/0043.webp", target: "quads" });
    expect(dto).not.toHaveProperty("searchText");
  });

  it("shows base substitutions to every clinic", async () => {
    const detailB = await exercises.getExercise(ctxB, agachamentoId);
    expect(detailB!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);
  });

  it("does not leak another clinic's custom exercise from getExercise", async () => {
    expect(await exercises.getExercise(ctxA, clinicBExerciseId)).toBeNull();
    expect(await exercises.getExercise(ctxB, clinicBExerciseId)).not.toBeNull();
  });

  it("marks base rules as read-only (not removable) for a clinic", async () => {
    const detail = await exercises.getExercise(ctxA, agachamentoId);
    const corrida = detail!.substitutes.find((s) => s.name === "Corrida")!;
    expect(corrida.removable).toBe(false);
    expect(
      await exercises.removeExerciseSubstitution(ctxA, agachamentoId, corrida.id),
    ).toBe(false);
  });

  it("lets a coach add and remove its own clinic substitution", async () => {
    const [rosca] = await db
      .select({ id: schema.exercise.id })
      .from(schema.exercise)
      .where(sql`${schema.exercise.name} = 'Rosca própria da clínica A'`);

    const added = await exercises.addExerciseSubstitution(ctxA, agachamentoId, rosca.id);
    expect(added.ok).toBe(true);
    const ruleId = (added as { ok: true; substitute: { id: string } }).substitute.id;

    const detailA = await exercises.getExercise(ctxA, agachamentoId);
    const rows = Object.fromEntries(detailA!.substitutes.map((s) => [s.name, s.removable]));
    expect(rows["Corrida"]).toBe(false);
    expect(rows["Rosca própria da clínica A"]).toBe(true);

    const detailB = await exercises.getExercise(ctxB, agachamentoId);
    expect(detailB!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);

    expect(
      await exercises.addExerciseSubstitution(ctxA, agachamentoId, agachamentoId),
    ).toEqual({ ok: false, reason: "same_exercise" });
    expect(
      await exercises.addExerciseSubstitution(ctxA, agachamentoId, rosca.id),
    ).toEqual({ ok: false, reason: "duplicate" });

    expect(await exercises.removeExerciseSubstitution(ctxB, agachamentoId, ruleId)).toBe(false);
    expect(await exercises.removeExerciseSubstitution(ctxA, agachamentoId, ruleId)).toBe(true);
    const after = await exercises.getExercise(ctxA, agachamentoId);
    expect(after!.substitutes.map((s) => s.name)).toEqual(["Corrida"]);
  });

  it("refuses to add a substitution against another clinic's exercise", async () => {
    expect(
      await exercises.addExerciseSubstitution(ctxA, clinicBExerciseId, agachamentoId),
    ).toEqual({ ok: false, reason: "exercise_not_found" });
    expect(
      await exercises.addExerciseSubstitution(ctxA, agachamentoId, clinicBExerciseId),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
  });

  it("lets a coach create, edit and archive its own custom exercise", async () => {
    const created = await exercises.createExercise(
      ctxA,
      exerciseInput({
        name: "Rosca direta com halteres",
        description: "Bíceps com halteres.",
        secondaryMuscles: ["forearms"],
        instructions: ["Segure os halteres.", "Flexione os cotovelos."],
        image: "custom/a.jpg",
      }),
    );
    expect(created.clinicId).toBe(ctxA.clinicId);
    expect(created.code).toBeNull();
    expect(created.source).toBe("custom");
    expect(created.mapPrimary).toEqual(["biceps"]);
    expect(created.mapSecondary).toEqual(["forearm"]);
    expect(created.muscleWeights).toEqual({ biceps: 1, forearm: 0.4 });

    const detailA = await exercises.getExercise(ctxA, created.id);
    expect(detailA?.origin).toBe("clinic");
    expect(detailA?.description).toBe("Bíceps com halteres.");
    expect(detailA?.image).toBe("custom/a.jpg");
    expect(detailA?.video).toBeNull();
    expect(await exercises.getExercise(ctxB, created.id)).toBeNull();

    expect(
      await exercises.updateExercise(ctxB, created.id, exerciseInput({ name: "Sequestro" })),
    ).toBeNull();
    const updated = await exercises.updateExercise(
      ctxA,
      created.id,
      exerciseInput({ name: "Rosca alternada", instructions: ["Alterne os braços."] }),
    );
    expect(updated?.name).toBe("Rosca alternada");
    expect(updated?.description).toBeNull();

    expect(await exercises.archiveExercise(ctxB, created.id)).toBeNull();
    expect(await exercises.archiveExercise(ctxA, created.id)).not.toBeNull();
    const list = await exercises.listExercises(ctxA, { pageSize: 100 });
    expect(list.items.map((i) => i.id)).not.toContain(created.id);
  });

  it("does not let a coach edit or archive a base exercise", async () => {
    expect(
      await exercises.updateExercise(ctxA, agachamentoId, exerciseInput({ name: "hijack" })),
    ).toBeNull();
    expect(await exercises.archiveExercise(ctxA, agachamentoId)).toBeNull();
    const stillThere = await exercises.getExercise(ctxA, agachamentoId);
    expect(stillThere?.name).toBe("Agachamento com barra");
    expect(stillThere?.archived).toBe(false);
  });
});

describe("exercise list order", () => {
  let orderDb: TestDb;
  let ctx: TenantContext;

  beforeAll(async () => {
    orderDb = await createTestDb();
    await orderDb.insert(schema.user).values({ id: "user-o", name: "Coach O", email: "o@example.com" });
    const [clinic] = await orderDb
      .insert(schema.clinic)
      .values({ name: "Clinic O", ownerUserId: "user-o" })
      .returning();
    ctx = { db: orderDb as unknown as DB, clinicId: clinic.id, userId: "user-o", role: "coach" };
    await orderDb.insert(schema.exercise).values([
      exerciseRow({ code: "1777", name: "Alongamento de peito", bodyPart: "chest", target: "pectorals", category: "stretching", popularity: -3 }),
      exerciseRow({ code: "0025", name: "Supino reto com barra", bodyPart: "chest", target: "pectorals", equipment: "barbell", popularity: 16 }),
      exerciseRow({ code: "0251", name: "Mergulho", bodyPart: "chest", target: "pectorals", popularity: 15 }),
      exerciseRow({ code: "0289", name: "Supino reto com halteres", bodyPart: "chest", target: "pectorals", equipment: "dumbbell", popularity: 10 }),
    ]);
  });

  it("lists the most common exercises first", async () => {
    const { items } = await exercises.listExercises(ctx, { bodyPart: "chest" });
    expect(items.map((i) => i.code)).toEqual(["0025", "0251", "0289", "1777"]);
  });

  it("puts the common exercise first among equal search matches", async () => {
    const { items } = await exercises.listExercises(ctx, { search: "supino reto com" });
    expect(items.map((i) => i.code)).toEqual(["0025", "0289"]);
  });
});
