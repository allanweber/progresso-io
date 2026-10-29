// Dev-time transformer: joins the two open exercise datasets into the compact
// gzipped NDJSON the deploy seed consumes (drizzle/data/exercises-catalog.ndjson.gz).
//
//   A = yuhonas/free-exercise-db  (Unlicense / public domain) — the canonical
//       English dataset; source of the stable enum values and the image keys.
//   B = joao-gugel/exercicios-bd-ptbr (full translation) — the same 873 rows,
//       keyed by the SAME `id`, with name/instructions/etc. in PT-BR.
//
// The two share `id` exactly (873/873, verified), so the join is A.id === B.id.
// We keep the human-facing text (name, instructions) from B (PT-BR) and the
// machine enums (category, level, force, mechanic, equipment, muscles) from A,
// normalized to stable snake_case slugs. The PT-BR labels for those enums live
// in src/lib/exercises.ts, mirroring how the food catalog labels its nutrients.
//
// Output format (one JSON object per line; the seed in scripts/migrate.mjs reads it):
//   { code, name, category, level, force, mechanic, equipment,
//     primaryMuscles:[...], secondaryMuscles:[...], instructions:[...], images:[...] }
//
// `code` is the source id (e.g. "3_4_Sit-Up"); it doubles as the image folder.
//
// Run: pnpm db:transform-exercises
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { EXERCISEDB_PTBR_FILE, MATCHES_FILE } from "./lib/exercisedb-vocab.mjs";

const SRC = join(process.cwd(), "drizzle", "data", "exercises-src");
const A_FILE = join(SRC, "free-exercise-db.json");
const B_FILE = join(SRC, "exercicios-ptbr-full.json");
const OUT = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");
const WGER_IMAGES_FILE = join(process.cwd(), "drizzle", "data", "wger-images.json");

/** snake_case slug for an enum value: "olympic weightlifting" → "olympic_weightlifting". */
function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Slugs a nullable enum cell (equipment/force/mechanic can be null in A). */
function slugOrNull(value) {
  return value === null || value === undefined || value === "" ? null : slug(value);
}

const a = JSON.parse(readFileSync(A_FILE, "utf8"));
const b = JSON.parse(readFileSync(B_FILE, "utf8"));
const aRows = Array.isArray(a) ? a : a.exercises;
const bRows = Array.isArray(b) ? b : b.exercises;

// Index the PT-BR rows by id for the join.
const byId = new Map(bRows.map((e) => [e.id, e]));

// Collect the distinct enum values we actually emit, so the transform can print
// them for a sanity check against the enums declared in schema.ts / lib.
const seen = {
  category: new Set(),
  level: new Set(),
  force: new Set(),
  mechanic: new Set(),
  equipment: new Set(),
  muscles: new Set(),
};

let missingTranslation = 0;

const matches = existsSync(MATCHES_FILE) ? JSON.parse(readFileSync(MATCHES_FILE, "utf8")).matches : [];
const openGymIdByCode = new Map(matches.filter((m) => m.code).map((m) => [m.code, m.openGymId]));
const exerciseDb = existsSync(EXERCISEDB_PTBR_FILE)
  ? JSON.parse(readFileSync(EXERCISEDB_PTBR_FILE, "utf8")).exercises
  : [];
const wgerImages = existsSync(WGER_IMAGES_FILE)
  ? JSON.parse(readFileSync(WGER_IMAGES_FILE, "utf8"))
  : {};

const freeDbExercises = aRows.map((en) => {
  const pt = byId.get(en.id);
  if (!pt) missingTranslation++;

  const category = slug(en.category);
  const level = slug(en.level);
  const force = slugOrNull(en.force);
  const mechanic = slugOrNull(en.mechanic);
  const equipment = slugOrNull(en.equipment);
  const primaryMuscles = (en.primaryMuscles ?? []).map(slug);
  const secondaryMuscles = (en.secondaryMuscles ?? []).map(slug);

  seen.category.add(category);
  seen.level.add(level);
  if (force) seen.force.add(force);
  if (mechanic) seen.mechanic.add(mechanic);
  if (equipment) seen.equipment.add(equipment);
  [...primaryMuscles, ...secondaryMuscles].forEach((m) => seen.muscles.add(m));

  return {
    code: en.id,
    // PT-BR text from B; fall back to the English source if a row lacks it.
    name: pt?.name ?? en.name,
    instructions: pt?.instructions ?? en.instructions ?? [],
    category,
    level,
    force,
    mechanic,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    // Image keys are identical across A and B ("<id>/0.jpg"); take A's.
    images: en.images ?? [],
    imageCredits: {},
    openGymId: openGymIdByCode.get(en.id) ?? null,
    source: "free-exercise-db",
  };
});

const exerciseDbExercises = exerciseDb.map((e) => {
  const code = `exercisedb-${e.id}`;
  const wger = wgerImages[code] ?? [];
  seen.category.add(e.category);
  seen.level.add(e.level);
  if (e.force) seen.force.add(e.force);
  if (e.mechanic) seen.mechanic.add(e.mechanic);
  if (e.equipment) seen.equipment.add(e.equipment);
  [...e.primaryMuscles, ...e.secondaryMuscles].forEach((m) => seen.muscles.add(m));
  return {
    code,
    name: e.name,
    instructions: e.instructions,
    category: e.category,
    level: e.level,
    force: e.force,
    mechanic: e.mechanic,
    equipment: e.equipment,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    images: wger.map((i) => i.key),
    imageCredits: Object.fromEntries(wger.map((i) => [i.key, i.credit])),
    openGymId: e.id,
    source: "exercisedb",
  };
});

const exercises = [...freeDbExercises, ...exerciseDbExercises];

const lines = exercises.map((o) => JSON.stringify(o)).join("\n");
writeFileSync(OUT, gzipSync(Buffer.from(lines, "utf8")));

const sorted = (set) => [...set].sort();
console.log(`✓ Exercise catalog written: ${OUT}`);
console.log(`  ${exercises.length} exercises · ${missingTranslation} without a PT-BR row`);
console.log(`  ${openGymIdByCode.size} matched to openGym · ${exerciseDbExercises.length} new from ExerciseDB`);
console.log(`  ${Object.keys(wgerImages).length} ExerciseDB exercises illustrated by wger images`);
console.log(`  categories : ${sorted(seen.category).join(", ")}`);
console.log(`  levels     : ${sorted(seen.level).join(", ")}`);
console.log(`  forces     : ${sorted(seen.force).join(", ")}`);
console.log(`  mechanics  : ${sorted(seen.mechanic).join(", ")}`);
console.log(`  equipment  : ${sorted(seen.equipment).join(", ")}`);
console.log(`  muscles    : ${sorted(seen.muscles).join(", ")}`);
