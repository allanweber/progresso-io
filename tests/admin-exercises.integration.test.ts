// @vitest-environment node
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { type DB, schema } from "@/db";
import { admin } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

let db: TestDb;
let clinicAId: string;
let baseSquat: string;
let baseLunge: string;
let baseLegPress: string;
let clinicAExercise: string;

/** Inserts an exercise (base when clinicId is null), computing search_text like the seed. */
async function addExercise(e: {
  code?: string | null;
  name: string;
  category?: schema.ExerciseCategory;
  equipment?: schema.ExerciseEquipment | null;
  primaryMuscles?: schema.Muscle[];
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
      level: "intermediate",
      equipment: e.equipment ?? null,
      primaryMuscles: e.primaryMuscles ?? ["quadriceps"],
      images: e.images ?? [],
      clinicId: e.clinicId ?? null,
      archived: e.archived ?? false,
    })
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
    code: "Barbell_Squat",
    name: "Agachamento com barra",
    equipment: "barbell",
    images: ["Barbell_Squat/0.jpg"],
  });
  baseLunge = await addExercise({
    code: "Dumbbell_Lunge",
    name: "Afundo com halteres",
    equipment: "dumbbell",
    images: ["Dumbbell_Lunge/0.jpg"],
  });
  baseLegPress = await addExercise({
    code: "Leg_Press",
    name: "Leg press",
    equipment: "machine",
  });
  clinicAExercise = await addExercise({
    name: "Agachamento próprio da clínica Alfa",
    equipment: "dumbbell",
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
    expect(sub?.thumbnail).toBe("Dumbbell_Lunge/0.jpg");
    expect(sub?.origin).toBe("base");

    // Self + duplicate rejected.
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
    // A clinic exercise as the substitute of a base rule would leak it to all.
    expect(
      await admin.addBaseExerciseSubstitution(adb(), baseSquat, clinicAExercise),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
    // A clinic exercise as the main of a base rule is rejected too.
    expect(
      await admin.addBaseExerciseSubstitution(adb(), clinicAExercise, baseLunge),
    ).toEqual({ ok: false, reason: "exercise_not_found" });
    // A missing substitute id is rejected.
    expect(
      await admin.addBaseExerciseSubstitution(
        adb(),
        baseSquat,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toEqual({ ok: false, reason: "substitute_not_found" });
  });

  it("does not remove a clinic-owned substitution as a base one", async () => {
    // A clinic rule on baseSquat (clinic_id set) must be immutable here.
    const [rule] = await db
      .insert(schema.exerciseSubstitution)
      .values({
        clinicId: clinicAId,
        exerciseId: baseSquat,
        substituteExerciseId: baseLegPress,
      })
      .returning({ id: schema.exerciseSubstitution.id });

    // getAnyExercise only surfaces base substitutions.
    const detail = await admin.getAnyExercise(adb(), baseSquat);
    expect(detail!.substitutes.length).toBe(0);
    // And the base removal never touches a clinic rule.
    expect(
      await admin.removeBaseExerciseSubstitution(adb(), baseSquat, rule.id),
    ).toBe(false);
  });
});

describe("admin exercises — base CRUD", () => {
  it("creates a base exercise visible to every clinic", async () => {
    const created = await admin.createBaseExercise(adb(), {
      name: "Remada curvada base",
      description: "Exercício de costas.",
      category: "strength",
      level: "intermediate",
      force: "pull",
      mechanic: "compound",
      equipment: "barbell",
      primaryMuscles: ["middle_back"],
      secondaryMuscles: ["biceps"],
      instructions: ["Incline o tronco.", "Puxe a barra."],
      images: ["custom/rem.jpg"],
    });
    expect(created.clinicId).toBeNull();
    expect(created.code).toBeNull();
    expect(created.source).toBe("custom");

    const detail = await admin.getAnyExercise(adb(), created.id);
    expect(detail?.origin).toBe("base");
    expect(detail?.description).toBe("Exercício de costas.");
    expect(detail?.images).toEqual(["custom/rem.jpg"]);
  });

  it("edits/archives base only — a clinic exercise is read-only here", async () => {
    const updated = await admin.updateBaseExercise(adb(), baseLegPress, {
      name: "Leg press renomeado",
      description: null,
      category: "strength",
      level: "beginner",
      force: null,
      mechanic: null,
      equipment: "machine",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: [],
      instructions: [],
      images: [],
    });
    expect(updated?.name).toBe("Leg press renomeado");

    // A clinic exercise can't be edited or archived through the base path.
    const clinicEdit = await admin.updateBaseExercise(adb(), clinicAExercise, {
      name: "Sequestro",
      description: null,
      category: "strength",
      level: "beginner",
      force: null,
      mechanic: null,
      equipment: null,
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      images: [],
    });
    expect(clinicEdit).toBeNull();
    expect(await admin.archiveBaseExercise(adb(), clinicAExercise)).toBeNull();

    // Archiving a base exercise works.
    expect(await admin.archiveBaseExercise(adb(), baseLegPress)).not.toBeNull();
  });

  it("archives any exercise as admin — base or a clinic's own", async () => {
    // A clinic exercise: the base-only archive refuses it…
    expect(await admin.archiveBaseExercise(adb(), clinicAExercise)).toBeNull();
    // …but the moderation archive retires it (across tenant), keeping its clinic.
    const archived = await admin.archiveAnyExercise(adb(), clinicAExercise);
    expect(archived?.archived).toBe(true);
    expect(archived?.clinicId).toBe(clinicAId);
    // Unknown id → null.
    expect(
      await admin.archiveAnyExercise(
        adb(),
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });

  it("unarchives any exercise as admin — base or a clinic's own", async () => {
    // clinicAExercise was archived just above — restore it (clinic scope kept).
    const backClinic = await admin.unarchiveAnyExercise(adb(), clinicAExercise);
    expect(backClinic?.archived).toBe(false);
    expect(backClinic?.clinicId).toBe(clinicAId);

    // A base exercise round-trips too.
    await admin.archiveAnyExercise(adb(), baseSquat);
    const backBase = await admin.unarchiveAnyExercise(adb(), baseSquat);
    expect(backBase?.archived).toBe(false);

    // Unknown id → null.
    expect(
      await admin.unarchiveAnyExercise(
        adb(),
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });
});
