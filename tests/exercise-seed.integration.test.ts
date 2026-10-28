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

const freeDbRows = catalog.filter((e) => e.source === "free-exercise-db");
const matched = freeDbRows.find((e) => e.openGymId) as Row;
const preExpansion = freeDbRows.map((e) => ({ ...e, openGymId: null }));
const preExpansionRules = rules
  .filter((r) => freeDbRows.some((e) => e.code === r.exercise))
  .map((r) => ({
    ...r,
    substitutes: r.substitutes.filter((s) => freeDbRows.some((e) => e.code === s)),
  }));

let db: TestDb;
let query: Query;

beforeAll(async () => {
  db = await createTestDb();
  query = async (text, params) => (await db.$client.query<Row>(text, params)).rows;

  await seedExerciseCatalog(query, preExpansion);
  await seedExerciseSubstitutionEdges(query, preExpansionRules);
  await query(
    "update exercise set name = 'Editado pelo admin', images = '{}' where code = $1",
    [matched.code],
  );
  await db.insert(schema.user).values({ id: "user-a", name: "Coach A", email: "a@example.com" });
  const [clinic] = await db
    .insert(schema.clinic)
    .values({ name: "Clinic A", ownerUserId: "user-a" })
    .returning();
  await query(
    `insert into exercise (name, search_text, category, level, clinic_id)
     values ('Exercício da clínica', 'exercicio da clinica', 'strength', 'beginner', $1)`,
    [clinic.id],
  );
}, 120_000);

describe("incremental exercise seed on an already-seeded database", () => {
  it("adds only the new exercises and links the matched ones", async () => {
    const first = await seedExerciseCatalog(query, catalog);
    const matchedCount = freeDbRows.filter((e) => e.openGymId).length;
    expect(first).toEqual({
      inserted: catalog.length - freeDbRows.length,
      linked: matchedCount,
    });

    const [{ count }] = await query(
      "select count(*)::int as count from exercise where clinic_id is null",
    );
    expect(count).toBe(catalog.length);
  }, 120_000);

  it("keeps an admin-edited matched exercise's text and gives it its openGym id", async () => {
    const [row] = await query(
      "select name, images, opengym_id from exercise where code = $1",
      [matched.code],
    );
    expect(row).toEqual({
      name: "Editado pelo admin",
      images: [],
      opengym_id: matched.openGymId,
    });
  });

  it("stores the new exercises as image-less exercisedb rows with their openGym id", async () => {
    const fresh = catalog.find((e) => e.source === "exercisedb") as Row;
    const [row] = await query(
      "select name, source, images, opengym_id, search_text from exercise where code = $1",
      [fresh.code],
    );
    expect(row).toMatchObject({
      name: fresh.name,
      source: "exercisedb",
      images: [],
      opengym_id: fresh.openGymId,
    });
    expect(row.search_text).not.toMatch(/[A-ZÀ-ÿ]/);
  });

  it("adds the missing substitution edges", async () => {
    const result = await seedExerciseSubstitutionEdges(query, rules);
    expect(result.inserted).toBeGreaterThan(0);
    const [{ count }] = await query(
      "select count(*)::int as count from exercise_substitution where clinic_id is null",
    );
    const expected = new Set(
      rules.flatMap((r) => r.substitutes.map((s) => `${r.exercise}:${s}`)),
    ).size;
    expect(count).toBe(expected);
  });

  it("is a no-op when run again", async () => {
    expect(await seedExerciseCatalog(query, catalog)).toEqual({ inserted: 0, linked: 0 });
    expect((await seedExerciseSubstitutionEdges(query, rules)).inserted).toBe(0);
  });

  it("leaves clinic custom exercises untouched", async () => {
    const rows = await query(
      "select name, code, opengym_id from exercise where clinic_id is not null",
    );
    expect(rows).toEqual([{ name: "Exercício da clínica", code: null, opengym_id: null }]);
  });
});
