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
    `insert into exercise (name, search_text, category, level, source, clinic_id)
     values ('Exercício da clínica', 'exercicio da clinica', 'strength', 'beginner', 'custom', $1)`,
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

  it("carries every openGym link from the artifact", async () => {
    const linked = catalog.filter((e) => e.openGymId).length;
    const [{ count }] = await query(
      "select count(*)::int as count from exercise where opengym_id is not null",
    );
    expect(count).toBe(linked);
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

  it("stores the images of an illustrated exercise with their credits", async () => {
    const illustrated = catalog.find((e) => (e.images as string[]).length > 0) as Row;
    const [row] = await query("select images, image_credits from exercise where code = $1", [
      illustrated.code,
    ]);
    expect(row).toEqual({ images: illustrated.images, image_credits: illustrated.imageCredits });
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
      "select name, code, opengym_id from exercise where clinic_id is not null",
    );
    expect(rows).toEqual([{ name: "Exercício da clínica", code: null, opengym_id: null }]);
  });
});
