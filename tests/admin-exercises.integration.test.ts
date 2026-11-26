// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { type DB, schema } from "@/db";
import { admin } from "@/server/dal";

import { exerciseInput, exerciseRow, type ExerciseSeed } from "./exercise-fixture";
import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let clinicAId: string;
let baseSquat: string;
let baseLunge: string;
let baseLegPress: string;
let clinicAExercise: string;

async function addExercise(e: ExerciseSeed) {
  const [row] = await db
    .insert(schema.exercise)
    .values(exerciseRow(e))
    .returning({ id: schema.exercise.id });
  return row.id;
}

const adb = () => db as unknown as DB;

beforeAll(async () => {
  db = await createTestDb();

  await db.insert(schema.user).values([
    { id: "u-a", name: "Coach A", email: "a@example.com" },
  ]);
  const [ca] = await db
    .insert(schema.clinic)
    .values({ name: "Clínica Alfa", ownerUserId: "u-a" })
    .returning();
  clinicAId = ca.id;

  baseSquat = await addExercise({
    code: "0043",
    name: "Agachamento com barra",
    equipment: "barbell",
    image: "still/0043.webp",
  });
  baseLunge = await addExercise({
    code: "0336",
    name: "Afundo com halteres",
    equipment: "dumbbell",
    image: "still/0336.webp",
  });
  baseLegPress = await addExercise({
    code: "0739",
    name: "Leg press",
    equipment: "sled machine",
    machineKind: "leg-press",
  });
  clinicAExercise = await addExercise({
    name: "Agachamento próprio da clínica Alfa",
    equipment: "dumbbell",
    source: "custom",
    clinicId: clinicAId,
  });
});

describe("admin exercises — base substitutions", () => {
  it("adds/rejects/removes base substitution rules", async () => {
    const ok = await admin.addBaseExerciseSubstitution(adb(), baseSquat, baseLunge);
    expect(ok.ok).toBe(true);

    const detail = await admin.getAnyExercise(adb(), baseSquat);
    const sub = detail!.substitutes.find((s) => s.exerciseId === baseLunge);
    expect(sub?.name).toBe("Afundo com halteres");
    expect(sub?.image).toBe("still/0336.webp");
    expect(sub?.origin).toBe("base");

    expect(
      await admin.addBaseExerciseSubstitution(adb(), baseSquat, baseSquat),
    ).toEqual({ ok: false, reason: "same_exercise" });
    expect(
      await admin.addBaseExerciseSubstitution(adb(), baseSquat, baseLunge),
    ).toEqual({ ok: false, reason: "duplicate" });

    const subId = (ok as { ok: true; substitute: { id: string } }).substitute.id;
    expect(
      await admin.removeBaseExerciseSubstitution(adb(), baseSquat, subId),
    ).toBe(true);
    const after = await admin.getAnyExercise(adb(), baseSquat);
    expect(after!.substitutes.length).toBe(0);
  });

  it("refuses a clinic exercise as either side of a base rule (no tenant leak)", async () => {
    expect(
      await admin.addBaseExerciseSubstitution(adb(), baseSquat, clinicAExercise),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
    expect(
      await admin.addBaseExerciseSubstitution(adb(), clinicAExercise, baseLunge),
    ).toEqual({ ok: false, reason: "exercise_not_found" });
    expect(
      await admin.addBaseExerciseSubstitution(
        adb(),
        baseSquat,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
  });

  it("does not remove a clinic-owned substitution as a base one", async () => {
    const [rule] = await db
      .insert(schema.exerciseSubstitution)
      .values({
        clinicId: clinicAId,
        exerciseId: baseSquat,
        substituteExerciseId: baseLegPress,
      })
      .returning({ id: schema.exerciseSubstitution.id });

    const detail = await admin.getAnyExercise(adb(), baseSquat);
    expect(detail!.substitutes.length).toBe(0);
    expect(
      await admin.removeBaseExerciseSubstitution(adb(), baseSquat, rule.id),
    ).toBe(false);
  });
});

describe("admin exercises — base CRUD", () => {
  it("creates a base exercise visible to every clinic", async () => {
    const created = await admin.createBaseExercise(
      adb(),
      exerciseInput({
        name: "Remada curvada base",
        description: "Exercício de costas.",
        bodyPart: "back",
        equipment: "barbell",
        target: "upper back",
        secondaryMuscles: ["biceps"],
        instructions: ["Incline o tronco.", "Puxe a barra."],
        image: "custom/rem.jpg",
      }),
    );
    expect(created.clinicId).toBeNull();
    expect(created.code).toBeNull();
    expect(created.source).toBe("custom");

    const detail = await admin.getAnyExercise(adb(), created.id);
    expect(detail?.origin).toBe("base");
    expect(detail?.description).toBe("Exercício de costas.");
    expect(detail?.image).toBe("custom/rem.jpg");
    expect(detail?.mapPrimary).toEqual(["upper-back"]);
  });

  it("edits/archives base only — a clinic exercise is read-only here", async () => {
    const updated = await admin.updateBaseExercise(
      adb(),
      baseLegPress,
      exerciseInput({
        name: "Leg press renomeado",
        bodyPart: "upper legs",
        equipment: "sled machine",
        machineKind: "leg-press",
        target: "quads",
      }),
    );
    expect(updated?.name).toBe("Leg press renomeado");

    const clinicEdit = await admin.updateBaseExercise(
      adb(),
      clinicAExercise,
      exerciseInput({ name: "Sequestro" }),
    );
    expect(clinicEdit).toBeNull();
    expect(await admin.archiveBaseExercise(adb(), clinicAExercise)).toBeNull();

    expect(await admin.archiveBaseExercise(adb(), baseLegPress)).not.toBeNull();
  });

  it("archives any exercise as admin — base or a clinic's own", async () => {
    expect(await admin.archiveBaseExercise(adb(), clinicAExercise)).toBeNull();
    const archived = await admin.archiveAnyExercise(adb(), clinicAExercise);
    expect(archived?.archived).toBe(true);
    expect(archived?.clinicId).toBe(clinicAId);
    expect(
      await admin.archiveAnyExercise(
        adb(),
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });

  it("unarchives any exercise as admin — base or a clinic's own", async () => {
    const backClinic = await admin.unarchiveAnyExercise(adb(), clinicAExercise);
    expect(backClinic?.archived).toBe(false);
    expect(backClinic?.clinicId).toBe(clinicAId);

    await admin.archiveAnyExercise(adb(), baseSquat);
    const backBase = await admin.unarchiveAnyExercise(adb(), baseSquat);
    expect(backBase?.archived).toBe(false);

    expect(
      await admin.unarchiveAnyExercise(
        adb(),
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });
});

describe("admin exercises — listing", () => {
  it("filters by origin and returns facets and counts", async () => {
    const base = await admin.listAllExercises(adb(), { origin: "base" });
    expect(base.items.every((e) => e.origin === "base")).toBe(true);
    const clinic = await admin.listAllExercises(adb(), { origin: "clinic" });
    expect(clinic.items.map((e) => e.clinicName)).toEqual(["Clínica Alfa"]);
    const all = await admin.listAllExercises(adb());
    expect(all.counts.base + all.counts.clinic).toBe(all.total);
    expect(all.facets.equipment).toContain("dumbbell");
  });

  it("searches both languages after a rename", async () => {
    await db
      .update(schema.exercise)
      .set({ nameEn: "Dumbbell Lunge", searchText: "afundo com halteres dumbbell lunge" })
      .where(sql`${schema.exercise.id} = ${baseLunge}`);
    await admin.updateBaseExercise(
      adb(),
      baseLunge,
      exerciseInput({
        name: "Avanço com halteres",
        nameEn: "Dumbbell Lunge",
        bodyPart: "upper legs",
        target: "quads",
      }),
    );

    for (const search of ["dumbbell lunge", "avanco", "avanço lunge"]) {
      const result = await admin.listAllExercises(adb(), { search });
      expect(result.items.map((e) => [e.name, e.nameEn])).toEqual([
        ["Avanço com halteres", "Dumbbell Lunge"],
      ]);
    }
    expect((await admin.listAllExercises(adb(), { search: "afundo" })).total).toBe(0);
  });
});
