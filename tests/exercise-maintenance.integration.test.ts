// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import {
  foldOps,
  pendingChanges,
  readOps,
  recordOp,
  removeOp,
  writeOps,
} from "../scripts/lib/exercise-maintenance.mjs";
import {
  readExerciseCatalog,
  seedExerciseCatalog,
  seedExerciseSubstitutionEdges,
} from "../scripts/lib/seed-exercises.mjs";

import { createTestDb, type TestDb } from "./pglite";

type Row = Record<string, unknown>;
type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
type Op = { id: string; code: string; type: string; [key: string]: unknown };

const catalogRow = (code: string, name: string, openGymId: string | null, source = "free-exercise-db") => ({
  code,
  name,
  nameEn: null,
  instructions: [],
  instructionsEn: [],
  category: "strength",
  level: "beginner",
  force: null,
  mechanic: null,
  equipment: "body_only",
  primaryMuscles: ["abdominals"],
  secondaryMuscles: [],
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

function tempArtifacts() {
  const dir = mkdtempSync(join(tmpdir(), "exercise-catalog-"));
  const files = {
    catalogFile: join(dir, "exercises-catalog.ndjson.gz"),
    substitutionsFile: join(dir, "exercise-substitutions.json"),
    opsFile: join(dir, "exercise-maintenance.json"),
  };
  writeFileSync(files.catalogFile, gzipSync(catalog.map((e) => JSON.stringify(e)).join("\n") + "\n"));
  writeFileSync(files.substitutionsFile, JSON.stringify({ generatedBy: "test", substitutions: rules }));
  return files;
}

describe("recording pending operations", () => {
  const base: Op[] = [{ id: "c1", code: "B", type: "archive" }];

  it("merges a second edit into the pending update of the same exercise", () => {
    const once = recordOp(base, { id: "o1", code: "A", type: "update", fields: { level: "expert" } });
    const twice = recordOp(once, { id: "o2", code: "A", type: "update", fields: { name: "New" } });
    expect(twice).toHaveLength(2);
    expect(twice[1]).toMatchObject({ id: "o1", fields: { level: "expert", name: "New" } });
  });

  it("cancels an archive with an unarchive", () => {
    const archived = recordOp(base, { id: "o1", code: "A", type: "archive" });
    expect(recordOp(archived, { id: "o2", code: "A", type: "unarchive" })).toEqual(base);
  });

  it("keeps only the latest openGym decision", () => {
    const first = recordOp(base, { id: "o1", code: "A", type: "link", openGymId: "0001" });
    const second = recordOp(first, { id: "o2", code: "A", type: "link", openGymId: null });
    expect(second.map((o: Op) => o.id)).toEqual(["c1", "o2"]);
  });

  it("discards a new exercise together with every change that depends on it", () => {
    const ops: Op[] = [
      ...base,
      { id: "n1", code: "New", type: "create", fields: { name: "Novo" } },
      { id: "n2", code: "New", type: "update", fields: { level: "expert" } },
      { id: "n3", code: "A", type: "add-substitute", substitute: "New" },
      { id: "n4", code: "A", type: "archive" },
    ];
    const result = removeOp(ops, "n1");
    expect(result.ops.map((o: Op) => o.id)).toEqual(["c1", "n4"]);
    expect(result.removed.map((o: Op) => o.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("drops a discarded image from the pending image order", () => {
    const key = "added/a/x1.webp";
    const ops: Op[] = [
      { id: "i1", code: "A", type: "add-image", key, credit: null },
      { id: "u1", code: "A", type: "update", fields: { images: ["a.jpg", key] } },
    ];
    expect(removeOp(ops, "i1").ops.at(-1)).toMatchObject({ fields: { images: ["a.jpg"] } });
  });

  it("compares an edit of a new exercise with the values it was created with", () => {
    const ops: Op[] = [
      { id: "n1", code: "New", type: "create", fields: { name: "Novo", level: "beginner", primaryMuscles: ["chest"] } },
      { id: "n2", code: "New", type: "update", fields: { level: "expert" } },
    ];
    expect(pendingChanges(ops)[1]).toMatchObject({ before: { level: "beginner" } });
  });
});

describe("folding pending operations into the catalog", () => {
  it("writes the resulting catalog and substitutions and clears the pending file", () => {
    const files = tempArtifacts();
    writeOps(
      [
        { id: "o1", code: "Crunches", type: "link", openGymId: "0274" },
        { id: "o2", code: "Plank", type: "link", openGymId: "0735" },
        { id: "o3", code: "Side_Bridge", type: "update", fields: { name: "Prancha lateral", nameEn: "Side Bridge" } },
        { id: "o4", code: "Sit-Up", type: "archive" },
        { id: "o5", code: "custom-remador", type: "create", fields: { name: "Remador", category: "cardio", level: "beginner", primaryMuscles: ["quadriceps"] } },
        { id: "o6", code: "custom-remador", type: "add-substitute", substitute: "Plank" },
      ],
      files.opsFile,
    );

    expect(foldOps(readOps(files.opsFile), files)).toEqual({ exercises: 4, substitutions: 3 });
    expect(readOps(files.opsFile)).toEqual([]);

    const byCode = new Map(readExerciseCatalog(files.catalogFile).map((e: Row) => [e.code, e]));
    expect([...byCode.keys()]).toEqual(["Crunches", "custom-remador", "Plank", "Side_Bridge"]);
    expect(byCode.get("Crunches")).toMatchObject({ openGymId: "0274" });
    expect(byCode.get("Plank")).toMatchObject({ openGymId: "0735" });
    expect(byCode.get("Side_Bridge")).toMatchObject({ name: "Prancha lateral", nameEn: "Side Bridge" });
    expect(byCode.get("custom-remador")).toMatchObject({ source: "custom", openGymId: null });

    const { substitutions } = JSON.parse(readFileSync(files.substitutionsFile, "utf8"));
    expect(substitutions).toEqual([
      { exercise: "Crunches", substitutes: ["Plank"] },
      { exercise: "custom-remador", substitutes: ["Plank"] },
      { exercise: "Plank", substitutes: ["Side_Bridge"] },
    ]);
  });
});

describe("seeding the catalog on deploy", () => {
  let db: TestDb;
  let query: Query;

  beforeAll(async () => {
    db = await createTestDb();
    query = async (text, params) => (await db.$client.query<Row>(text, params)).rows;
  }, 120_000);

  it("inserts every exercise once, searchable by both names", async () => {
    const withEnglish = catalog.map((e) => (e.code === "Plank" ? { ...e, nameEn: "Plank" } : e));
    expect(await seedExerciseCatalog(query, withEnglish)).toEqual({ inserted: 5 });
    expect(await seedExerciseCatalog(query, withEnglish)).toEqual({ inserted: 0 });
    const [plank] = await query("select search_text, opengym_id, source from exercise where code = 'Plank'");
    expect(plank).toEqual({ search_text: "prancha plank", opengym_id: null, source: "free-exercise-db" });
    const [sitUp] = await query("select opengym_id from exercise where code = 'Sit-Up'");
    expect(sitUp.opengym_id).toBe("0735");
  });

  it("inserts the base substitution edges once and skips unknown codes", async () => {
    const withUnknown = [...rules, { exercise: "Plank", substitutes: ["Missing", "Plank"] }];
    expect(await seedExerciseSubstitutionEdges(query, withUnknown)).toEqual({ inserted: 4 });
    expect(await seedExerciseSubstitutionEdges(query, withUnknown)).toEqual({ inserted: 0 });
  });
});
