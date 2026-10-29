// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  applyExerciseMaintenance,
  maintenanceSeedGuards,
  recordOp,
  removeOp,
} from "../scripts/lib/exercise-maintenance.mjs";
import {
  seedExerciseCatalog,
  seedExerciseSubstitutionEdges,
} from "../scripts/lib/seed-exercises.mjs";

import * as schema from "@/db/schema";

import { createTestDb, type TestDb } from "./pglite";

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
type OpInput = { code: string; type: string; [key: string]: unknown };
type Op = OpInput & { id: string };

let db: TestDb;
let query: Query;
let clinicId: string;
let workoutExerciseId: string;
const ids: Record<string, string> = {};

const catalogRow = (code: string, name: string, openGymId: string | null, source = "free-exercise-db") => ({
  code,
  name,
  category: "strength",
  level: "beginner",
  force: null,
  mechanic: null,
  equipment: "body_only",
  primaryMuscles: ["abdominals"],
  secondaryMuscles: [],
  instructions: [],
  images: [],
  imageCredits: {},
  openGymId,
  source,
});

const catalog = [
  catalogRow("Crunches", "Abdominal", null),
  catalogRow("exercisedb-0274", "Abdominal no chão", "0274", "exercisedb"),
  catalogRow("Sit-Up", "Abdominal completo", "0735"),
  catalogRow("Plank", "Prancha", null),
  catalogRow("Side_Bridge", "Ponte lateral", null),
];

const rules = [
  { exercise: "exercisedb-0274", substitutes: ["Plank", "Crunches"] },
  { exercise: "Crunches", substitutes: ["Plank"] },
  { exercise: "Plank", substitutes: ["Side_Bridge"] },
];

let n = 0;
const op = (o: OpInput): Op => ({ ...o, id: `op-${++n}`, at: new Date().toISOString() });

const row = async (code: string) =>
  (await query("select * from exercise where code = $1", [code]))[0];

beforeAll(async () => {
  db = await createTestDb();
  query = async (text, params) => (await db.$client.query<Row>(text, params)).rows;
  await seedExerciseCatalog(query, catalog);
  await seedExerciseSubstitutionEdges(query, rules);
  for (const r of await query("select id, code from exercise")) ids[r.code as string] = r.id as string;

  await db.insert(schema.user).values({ id: "u-a", name: "Coach A", email: "a@example.com" });
  const [clinic] = await db.insert(schema.clinic).values({ name: "Clínica A", ownerUserId: "u-a" }).returning();
  clinicId = clinic.id;
  const [workout] = await db.insert(schema.workout).values({ clinicId, name: "Treino A" }).returning();
  const [session] = await db
    .insert(schema.workoutSession)
    .values({ workoutId: workout.id, name: "Ficha A" })
    .returning();
  const [we] = await db
    .insert(schema.workoutExercise)
    .values({ workoutSessionId: session.id, exerciseId: ids["exercisedb-0274"], sets: 3, reps: { kind: "fixed", value: 10 } })
    .returning();
  workoutExerciseId = we.id;
  await db.insert(schema.workoutExerciseSubstitute).values([
    { workoutExerciseId: we.id, substituteExerciseId: ids["Plank"] },
    { workoutExerciseId: we.id, substituteExerciseId: ids["Crunches"] },
  ]);
  await db.insert(schema.exerciseSubstitution).values({
    clinicId,
    exerciseId: ids["exercisedb-0274"],
    substituteExerciseId: ids["Side_Bridge"],
  });
}, 120_000);

describe("recording operations in the maintenance file", () => {
  const committed = new Set(["c1"]);
  const base: Op[] = [{ id: "c1", code: "A", type: "update", fields: { name: "Old" } }];

  it("folds an uncommitted edit into the pending update of the same exercise", () => {
    const once = recordOp(base, committed, { id: "o1", code: "A", type: "update", fields: { level: "expert" } });
    const twice = recordOp(once, committed, { id: "o2", code: "A", type: "update", fields: { name: "New" } });
    expect(twice).toHaveLength(2);
    expect(twice[1]).toMatchObject({ id: "o1", fields: { level: "expert", name: "New" } });
  });

  it("cancels an uncommitted archive with an unarchive", () => {
    const archived = recordOp(base, committed, { id: "o1", code: "A", type: "archive" });
    expect(recordOp(archived, committed, { id: "o2", code: "A", type: "unarchive" })).toEqual(base);
  });

  it("keeps only the latest uncommitted openGym decision", () => {
    const first = recordOp(base, committed, { id: "o1", code: "A", type: "link", openGymId: "0001" });
    const second = recordOp(first, committed, { id: "o2", code: "A", type: "link", openGymId: null });
    expect(second.map((o: Op) => o.id)).toEqual(["c1", "o2"]);
  });

  it("refuses to remove a committed operation", () => {
    expect(removeOp(base, committed, "c1")).toMatchObject({ ok: false });
  });
});

describe("applying maintenance operations on deploy", () => {
  it("merges the imported duplicate into ours when linking its openGym id", async () => {
    const result = await applyExerciseMaintenance(query, [
      op({ type: "link", code: "Crunches", openGymId: "0274" }),
    ]);
    expect(result).toEqual({ applied: 1, skipped: [] });

    expect(await row("Crunches")).toMatchObject({ opengym_id: "0274", archived: false });
    expect(await row("exercisedb-0274")).toMatchObject({ opengym_id: null, archived: true });

    const [we] = await query("select exercise_id from workout_exercise where id = $1", [workoutExerciseId]);
    expect(we.exercise_id).toBe(ids["Crunches"]);
    const subs = await query(
      "select substitute_exercise_id from workout_exercise_substitute where workout_exercise_id = $1",
      [workoutExerciseId],
    );
    expect(subs.map((s) => s.substitute_exercise_id)).toEqual([ids["Plank"]]);

    const edges = await query(
      "select exercise_id, substitute_exercise_id, clinic_id from exercise_substitution where $1 in (exercise_id, substitute_exercise_id) order by clinic_id nulls first",
      [ids["Crunches"]],
    );
    expect(edges).toEqual([
      { exercise_id: ids["Crunches"], substitute_exercise_id: ids["Plank"], clinic_id: null },
      { exercise_id: ids["Crunches"], substitute_exercise_id: ids["Side_Bridge"], clinic_id: clinicId },
    ]);
  });

  it("never runs an applied operation twice", async () => {
    const again = await applyExerciseMaintenance(query, [
      { id: "op-1", code: "Crunches", type: "link", openGymId: "0274" },
    ]);
    expect(again).toEqual({ applied: 0, skipped: [] });
  });

  it("moves an openGym id held by another of our exercises without archiving it", async () => {
    await applyExerciseMaintenance(query, [op({ type: "link", code: "Plank", openGymId: "0735" })]);
    expect(await row("Plank")).toMatchObject({ opengym_id: "0735" });
    expect(await row("Sit-Up")).toMatchObject({ opengym_id: null, archived: false });
  });

  it("edits fields and recomputes the search text on a rename", async () => {
    await applyExerciseMaintenance(query, [
      op({ type: "update", code: "Side_Bridge", fields: { name: "Prancha Lateral", level: "expert", primaryMuscles: ["abdominals", "glutes"] } }),
    ]);
    expect(await row("Side_Bridge")).toMatchObject({
      name: "Prancha Lateral",
      search_text: "prancha lateral",
      level: "expert",
      primary_muscles: ["abdominals", "glutes"],
    });
  });

  it("archives and restores", async () => {
    await applyExerciseMaintenance(query, [op({ type: "archive", code: "Sit-Up" })]);
    expect((await row("Sit-Up")).archived).toBe(true);
    await applyExerciseMaintenance(query, [op({ type: "unarchive", code: "Sit-Up" })]);
    expect((await row("Sit-Up")).archived).toBe(false);
  });

  it("uploads an added image once and attaches it with its credit", async () => {
    const uploadImage = vi.fn(async () => {});
    const credit = { author: "Allan", license: "CC0", licenseUrl: "", sourceUrl: "", aiGenerated: false };
    await applyExerciseMaintenance(
      query,
      [op({ type: "add-image", code: "Plank", key: "added/plank/x1.webp", credit })],
      { uploadImage },
    );
    expect(uploadImage).toHaveBeenCalledWith("added/plank/x1.webp");
    expect(await row("Plank")).toMatchObject({
      images: ["added/plank/x1.webp"],
      image_credits: { "added/plank/x1.webp": credit },
    });
  });

  it("creates a new base exercise and edits its substitutions", async () => {
    await applyExerciseMaintenance(query, [
      op({ type: "create", code: "custom-dead-bug", fields: { name: "Dead bug", category: "strength", level: "beginner", primaryMuscles: ["abdominals"] } }),
      op({ type: "add-substitute", code: "custom-dead-bug", substitute: "Plank" }),
      op({ type: "remove-substitute", code: "Plank", substitute: "Side_Bridge" }),
    ]);
    const created = await row("custom-dead-bug");
    expect(created).toMatchObject({ name: "Dead bug", source: "custom", clinic_id: null });
    const edges = await query(
      "select substitute_exercise_id from exercise_substitution where exercise_id = $1 and clinic_id is null",
      [created.id],
    );
    expect(edges).toEqual([{ substitute_exercise_id: ids["Plank"] }]);
    expect(
      await query(
        "select 1 from exercise_substitution where exercise_id = $1 and substitute_exercise_id = $2",
        [ids["Plank"], ids["Side_Bridge"]],
      ),
    ).toEqual([]);
  });

  it("records an operation on a missing exercise as skipped and does not retry it", async () => {
    const missing = op({ type: "archive", code: "Nope" });
    const first = await applyExerciseMaintenance(query, [missing]);
    expect(first.skipped).toEqual([
      { id: missing.id, code: "Nope", type: "archive", reason: "exercício não encontrado" },
    ]);
    expect(await applyExerciseMaintenance(query, [missing])).toEqual({ applied: 0, skipped: [] });
  });

  it("unlinks, and the next deploy seed neither relinks nor restores removed substitutions", async () => {
    const ops = [
      op({ type: "link", code: "Sit-Up", openGymId: null }),
      op({ type: "link", code: "Plank", openGymId: "0735" }),
      op({ type: "remove-substitute", code: "Plank", substitute: "Side_Bridge" }),
    ];
    await applyExerciseMaintenance(query, ops.slice(0, 1));
    const guards = maintenanceSeedGuards(ops, catalog);
    await query("update exercise set opengym_id = null where code = 'Plank'");

    expect(await seedExerciseCatalog(query, catalog, guards)).toEqual({ inserted: 0, linked: 0 });
    expect((await row("Sit-Up")).opengym_id).toBeNull();
    expect((await row("exercisedb-0274")).opengym_id).toBeNull();

    await seedExerciseSubstitutionEdges(query, rules, guards);
    expect(
      await query(
        "select 1 from exercise_substitution where exercise_id = $1 and substitute_exercise_id = $2",
        [ids["Plank"], ids["Side_Bridge"]],
      ),
    ).toEqual([]);
    expect(
      await query("select 1 from exercise_substitution where exercise_id = $1", [ids["exercisedb-0274"]]),
    ).toEqual([]);
  });
});
