// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  readExerciseCatalog,
  seedExerciseCatalog,
  seedExerciseSubstitutionEdges,
} from "../scripts/lib/seed-exercises.mjs";

import * as schema from "@/db/schema";

import { createTestDb, type TestDb } from "./pglite";

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

const data = (p: string) => join(process.cwd(), "drizzle", "data", p);
const catalog = readExerciseCatalog(data("exercises-catalog.ndjson.gz")) as Row[];
const rules = JSON.parse(readFileSync(data("exercise-substitutions.json"), "utf8"))
  .substitutions as { exercise: string; substitutes: string[] }[];

let db: TestDb;
let query: Query;

beforeAll(async () => {
  db = await createTestDb();
  query = async (text, params) => (await db.$client.query<Row>(text, params)).rows;
  await db.insert(schema.user).values({ id: "user-a", name: "Coach A", email: "a@example.com" });
  const [clinic] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "user-a" })
    .returning();
  await query(
    `insert into exercise (name, search_text, body_part, category, equipment, target, source, clinic_id)
     values ('Exercício da clínica', 'exercicio da clinica', 'waist', 'strength', 'body weight', 'abs', 'custom', $1)`,
    [clinic.id],
  );
}, 120_000);

describe("exercise seed from the catalog artifact", () => {
  it("inserts every catalog exercise as a base row", async () => {
    expect(await seedExerciseCatalog(query, catalog)).toEqual({ inserted: catalog.length });
    const [{ count }] = await query(
      "select count(*)::int as count from exercise where clinic_id is null and code is not null",
    );
    expect(count).toBe(catalog.length);
  });

  it("stores every exercise as an openGym row with its media", async () => {
    const [{ count }] = await query(
      "select count(*)::int as count from exercise where source = 'opengym' and image is not null and video is not null",
    );
    expect(count).toBe(catalog.length);
  });

  it("stores the English name and instructions, searchable in both languages", async () => {
    const english = catalog.find((e) => e.nameEn) as Row;
    const [row] = await query(
      "select name_en, instructions_en, search_text from exercise where code = $1",
      [english.code],
    );
    expect(row.name_en).toBe(english.nameEn);
    expect(row.instructions_en).toEqual(english.instructionsEn);
    const [{ expected }] = await query("select unaccent(lower($1 || ' ' || $2)) as expected", [
      english.name,
      english.nameEn,
    ]);
    expect(row.search_text).toBe(expected);
  });

  it("stores the female media, the body map and the muscle weights", async () => {
    const female = catalog.find((e) => e.femaleImage) as Row;
    const [row] = await query(
      "select female_image, female_video, map_primary, map_secondary, muscle_weights, secondary_muscles from exercise where code = $1",
      [female.code],
    );
    expect(row).toEqual({
      female_image: female.femaleImage,
      female_video: female.femaleVideo,
      map_primary: female.mapPrimary,
      map_secondary: female.mapSecondary,
      muscle_weights: female.muscleWeights,
      secondary_muscles: female.secondaryMuscles,
    });
  });

  it("inserts every base substitution edge", async () => {
    const expected = new Set(rules.flatMap((r) => r.substitutes.map((s) => `${r.exercise}:${s}`))).size;
    expect(await seedExerciseSubstitutionEdges(query, rules)).toEqual({ inserted: expected });
  });

  it("is a no-op when run again", async () => {
    expect(await seedExerciseCatalog(query, catalog)).toEqual({ inserted: 0 });
    expect(await seedExerciseSubstitutionEdges(query, rules)).toEqual({ inserted: 0 });
  });

  it("leaves clinic custom exercises untouched", async () => {
    const rows = await query(
      "select name, code, source from exercise where clinic_id is not null",
    );
    expect(rows).toEqual([{ name: "Exercício da clínica", code: null, source: "custom" }]);
  });
});
