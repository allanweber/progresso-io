import { existsSync, writeFileSync } from "node:fs";
import {
  CATEGORIES,
  EQUIPMENT,
  EXERCISEDB_EQUIPMENT,
  EXERCISEDB_FILE,
  EXERCISEDB_PTBR_FILE,
  EXERCISEDB_TARGET,
  FORCES,
  LEVELS,
  MATCHES_FILE,
  MECHANICS,
  MUSCLES,
  PTBR_FILE,
  readJson,
} from "./lib/exercisedb-vocab.mjs";
import { MODEL, askJson, inBatches, requireKey } from "./lib/openrouter.mjs";

const BATCH = 12;
const CONCURRENCY = 4;

const matches = readJson(MATCHES_FILE).matches;
const unmatched = new Set(matches.filter((m) => !m.code).map((m) => m.openGymId));
const incoming = readJson(EXERCISEDB_FILE).filter((x) => unmatched.has(x.id));

const ptbr = readJson(PTBR_FILE);
const examples = [
  "Barbell_Bench_Press_-_Medium_Grip",
  "Barbell_Full_Squat",
  "Wide-Grip_Lat_Pulldown",
  "Dumbbell_Bicep_Curl",
  "Leg_Press",
  "Seated_Cable_Rows",
  "Side_Lateral_Raise",
  "Triceps_Pushdown",
  "Standing_Calf_Raises",
  "Plank",
]
  .map((id) => ptbr.find((e) => e.id === id))
  .filter(Boolean)
  .map((e) => `- ${e.name}`)
  .join("\n");
const takenNames = new Set(ptbr.map((e) => e.name.toLowerCase()));

const previous = existsSync(EXERCISEDB_PTBR_FILE) ? readJson(EXERCISEDB_PTBR_FILE).exercises : [];
const done = new Map(previous.filter((e) => unmatched.has(e.id)).map((e) => [e.id, e]));
const pending = incoming.filter((x) => !done.has(x.id));

const SYSTEM = `You prepare gym exercises for a Brazilian coaching app. For each English exercise, produce:
- "name": the Brazilian Portuguese name a Brazilian gym coach would use, sentence case, equipment and variant included when they distinguish it (e.g. "com halteres", "na polia", "no smith", "unilateral"). Match the style of these existing names:
${examples}
- "instructions": the steps translated to natural Brazilian Portuguese, imperative mood ("Deite-se…", "Segure…"), same number of steps, faithful to the English, no additions.
- "category": one of ${CATEGORIES.join(", ")}.
- "level": one of ${LEVELS.join(", ")}.
- "force": one of ${FORCES.join(", ")}, or null when not applicable.
- "mechanic": one of ${MECHANICS.join(", ")}, or null when not applicable.
- "equipment": one of ${EQUIPMENT.join(", ")}, or null for none.
- "primaryMuscles": 1 to 3 of ${MUSCLES.join(", ")}.
- "secondaryMuscles": 0 to 5 of the same list, never repeating a primary.
Use only the listed values. Answer with only a JSON object: {"exercises": {"<id>": {...}, ...}} covering every id.`;

const describe = (x) =>
  [
    `ID ${x.id}: "${x.name}"`,
    `  body part: ${x.bodyPart} · equipment: ${x.equipment} (suggested: ${EXERCISEDB_EQUIPMENT[x.equipment] ?? "?"}) · target: ${x.target} (suggested: ${EXERCISEDB_TARGET[x.target] ?? "?"}) · secondary: ${x.secondaryMuscles.join(", ") || "-"}`,
    ...x.instructions.map((s, i) => `  ${i + 1}. ${s}`),
  ].join("\n");

const oneOf = (list, v, nullable, what) => {
  if (v === null && nullable) return;
  if (!list.includes(v)) throw new Error(`${what}: ${JSON.stringify(v)}`);
};

function check(x, e) {
  if (!e) throw new Error(`missing ${x.id}`);
  if (typeof e.name !== "string" || !e.name.trim()) throw new Error(`${x.id} name`);
  if (!Array.isArray(e.instructions) || e.instructions.length !== x.instructions.length)
    throw new Error(`${x.id} instructions count`);
  if (e.instructions.some((s) => typeof s !== "string" || !s.trim())) throw new Error(`${x.id} empty step`);
  oneOf(CATEGORIES, e.category, false, `${x.id} category`);
  oneOf(LEVELS, e.level, false, `${x.id} level`);
  oneOf(FORCES, e.force, true, `${x.id} force`);
  oneOf(MECHANICS, e.mechanic, true, `${x.id} mechanic`);
  oneOf(EQUIPMENT, e.equipment, true, `${x.id} equipment`);
  if (!Array.isArray(e.primaryMuscles) || e.primaryMuscles.length < 1) throw new Error(`${x.id} primary`);
  if (!Array.isArray(e.secondaryMuscles)) throw new Error(`${x.id} secondary`);
  for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) oneOf(MUSCLES, m, false, `${x.id} muscle`);
  if (e.secondaryMuscles.some((m) => e.primaryMuscles.includes(m))) throw new Error(`${x.id} muscle repeated`);
}

const save = () => {
  const exercises = incoming.map((x) => done.get(x.id)).filter(Boolean);
  writeFileSync(
    EXERCISEDB_PTBR_FILE,
    JSON.stringify({ generatedBy: "scripts/enrich-exercisedb.mjs", model: MODEL, exercises }, null, 1) + "\n",
  );
};

if (pending.length) {
  requireKey();
  console.log(`Asking ${MODEL} to translate and classify ${pending.length} exercises…`);
  await inBatches(pending, BATCH, CONCURRENCY, async (batch, i, total) => {
    const answer = await askJson({
      system: SYSTEM,
      user: batch.map(describe).join("\n\n"),
      validate: (a) => batch.forEach((x) => check(x, a.exercises?.[x.id])),
    });
    for (const x of batch) {
      const e = answer.exercises[x.id];
      done.set(x.id, {
        id: x.id,
        name: e.name.trim(),
        instructions: e.instructions.map((s) => s.trim()),
        category: e.category,
        level: e.level,
        force: e.force,
        mechanic: e.mechanic,
        equipment: e.equipment,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
      });
    }
    save();
    console.log(`  batch ${i + 1}/${total}`);
  });
}
save();

const names = new Map();
for (const e of done.values()) {
  const key = e.name.toLowerCase();
  names.set(key, [...(names.get(key) ?? []), e.id]);
}
const clashes = [...done.values()].filter((e) => takenNames.has(e.name.toLowerCase()));
const repeats = [...names.entries()].filter(([, ids]) => ids.length > 1);
console.log(`✓ ${EXERCISEDB_PTBR_FILE}: ${done.size}/${incoming.length} exercises`);
if (clashes.length) console.log(`  ⚠ ${clashes.length} names equal an existing exercise: ${clashes.map((e) => `${e.id} "${e.name}"`).join("; ")}`);
if (repeats.length) console.log(`  ⚠ ${repeats.length} names repeated among new ones: ${repeats.map(([n, ids]) => `"${n}" (${ids.join(", ")})`).join("; ")}`);
