import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL =
  "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json";
const DIR = join(process.cwd(), "drizzle", "data", "exercisedb-src");
const OUT = join(DIR, "exercisedb.json");

const res = await fetch(URL);
if (!res.ok) throw new Error(`GET ${URL} → ${res.status}`);
const rows = await res.json();

const exercises = rows.map((r) => ({
  id: r.id,
  name: r.name,
  bodyPart: r.category,
  equipment: r.equipment,
  target: r.target,
  secondaryMuscles: r.secondary_muscles ?? [],
  instructions: r.instruction_steps?.en ?? [],
}));

const ids = new Set(exercises.map((e) => e.id));
if (ids.size !== exercises.length) throw new Error("duplicate ids in source");
const empty = exercises.filter((e) => e.instructions.length === 0).map((e) => e.id);
if (empty.length) throw new Error(`no English instructions: ${empty.join(", ")}`);

mkdirSync(DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(exercises, null, 1) + "\n");
console.log(`✓ ${exercises.length} exercises written to ${OUT} (text only, no media)`);
