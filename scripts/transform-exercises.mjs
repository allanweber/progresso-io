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
// Run: npm run db:transform-exercises
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const SRC = join(process.cwd(), "drizzle", "data", "exercises-src");
const A_FILE = join(SRC, "free-exercise-db.json");
const B_FILE = join(SRC, "exercicios-ptbr-full.json");
const OUT = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");

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

const exercises = aRows.map((en) => {
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
  };
});

const lines = exercises.map((o) => JSON.stringify(o)).join("\n");
writeFileSync(OUT, gzipSync(Buffer.from(lines, "utf8")));

const sorted = (set) => [...set].sort();
console.log(`✓ Exercise catalog written: ${OUT}`);
console.log(`  ${exercises.length} exercises · ${missingTranslation} without a PT-BR row`);
console.log(`  categories : ${sorted(seen.category).join(", ")}`);
console.log(`  levels     : ${sorted(seen.level).join(", ")}`);
console.log(`  forces     : ${sorted(seen.force).join(", ")}`);
console.log(`  mechanics  : ${sorted(seen.mechanic).join(", ")}`);
console.log(`  equipment  : ${sorted(seen.equipment).join(", ")}`);
console.log(`  muscles    : ${sorted(seen.muscles).join(", ")}`);
