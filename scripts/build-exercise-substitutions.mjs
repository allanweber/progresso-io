// Dev-time builder: derives the base exercise-substitution rules from the seed
// catalog (drizzle/data/exercises-catalog.ndjson.gz) and writes them to
// drizzle/data/exercise-substitutions.json, which the deploy seed loads.
//
// A substitute is an exercise that trains the same muscle in the same way, so
// two exercises are candidates when they share the SAME (category, primary
// muscles, force, mechanic) — a high-precision key: 93% of exercises land in a
// group with at least one peer, and a group never mixes categories (a stretch
// is never offered for a strength lift) or muscles.
//
// Within a group, each exercise gets up to PER_EXERCISE substitutes, chosen to
// be the ones a coach reaches for first in a STANDARD GYM: common, easy-to-swap
// equipment (free weights, machine, cable, bodyweight) over exotic gear, easier
// levels first, and — the key rule — a barbell exercise always offers at least
// one dumbbell alternative and vice versa (when the group has one). Selection is
// fully deterministic (sorted, no randomness).
//
// Run: pnpm db:build-exercise-substitutions
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const CATALOG = join(process.cwd(), "drizzle", "data", "exercises-catalog.ndjson.gz");
const OUT = join(process.cwd(), "drizzle", "data", "exercise-substitutions.json");
const PER_EXERCISE = 3;

// How common / easy each equipment is in a standard gym (lower = reach for first).
const COMMONNESS = {
  dumbbell: 0,
  barbell: 1,
  machine: 2,
  cable: 3,
  body_only: 4,
  e_z_curl_bar: 5,
  kettlebells: 6,
  bands: 7,
  medicine_ball: 8,
  exercise_ball: 9,
  other: 10,
  foam_roll: 11,
  "∅": 12,
};
const commonness = (eq) => COMMONNESS[eq ?? "∅"] ?? 12;
const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };

const text = gunzipSync(readFileSync(CATALOG)).toString("utf8");
const exercises = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byCode = new Map(exercises.map((e) => [e.code, e]));

/** The grouping key: same training intent (category, muscles, force, mechanic). */
function groupKey(e) {
  const muscles = (e.primaryMuscles ?? []).slice().sort().join("+");
  return [e.category, muscles, e.force ?? "∅", e.mechanic ?? "∅"].join(" | ");
}

// Bucket every exercise by its group key.
const groups = new Map();
for (const e of exercises) {
  const k = groupKey(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

/**
 * Picks up to PER_EXERCISE substitutes for `e` from its group `peers`, favoring
 * the most common/easiest gym equipment and keeping some variety:
 *
 *  1. Candidates are ranked by equipment commonness, then easier level, then
 *     name — all deterministic.
 *  2. The barbell↔dumbbell rule: a barbell exercise takes the best dumbbell
 *     candidate first (and vice versa), when the group has one.
 *  3. Remaining slots are filled from the ranked list, preferring an equipment
 *     not already picked (variety) before allowing a repeat.
 */
function pickSubstitutes(e, peers) {
  const ranked = peers
    .filter((p) => p.code !== e.code)
    .sort(
      (a, b) =>
        commonness(a.equipment) - commonness(b.equipment) ||
        (LEVEL_RANK[a.level] ?? 9) - (LEVEL_RANK[b.level] ?? 9) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );

  const chosen = [];
  const take = (p) => {
    if (p && !chosen.includes(p) && chosen.length < PER_EXERCISE) chosen.push(p);
  };

  // 1. Guarantee a barbell↔dumbbell counterpart.
  const cross =
    e.equipment === "barbell"
      ? "dumbbell"
      : e.equipment === "dumbbell"
        ? "barbell"
        : null;
  if (cross) take(ranked.find((p) => p.equipment === cross));

  // 2. Fill remaining slots, preferring an equipment not yet chosen (variety).
  const usedEq = () => new Set(chosen.map((p) => p.equipment ?? "∅"));
  for (const p of ranked) {
    if (chosen.length >= PER_EXERCISE) break;
    if (!usedEq().has(p.equipment ?? "∅")) take(p);
  }
  // 3. Still short? Allow repeated equipment, most-common first.
  for (const p of ranked) {
    if (chosen.length >= PER_EXERCISE) break;
    take(p);
  }

  return chosen.map((p) => p.code);
}

const substitutions = [];
let linked = 0;
let edges = 0;
for (const e of exercises) {
  const peers = groups.get(groupKey(e));
  if (peers.length <= 1) continue;
  const subs = pickSubstitutes(e, peers);
  if (subs.length === 0) continue;
  substitutions.push({ exercise: e.code, substitutes: subs });
  linked++;
  edges += subs.length;
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedBy: "scripts/build-exercise-substitutions.mjs",
      groupedBy: "category + primaryMuscles + force + mechanic",
      perExercise: PER_EXERCISE,
      substitutions,
    },
    null,
    2,
  ),
);

console.log(`✓ Exercise substitutions written: ${OUT}`);
console.log(
  `  ${linked}/${exercises.length} exercises linked · ${edges} directed edges · avg ${(edges / linked).toFixed(1)} per linked exercise`,
);

// A small readable sample for review (PT-BR names, varied muscles).
const sampleCodes = [
  "Barbell_Bench_Press",
  "Barbell_Full_Squat",
  "Barbell_Curl",
  "Pushups",
  "Plank",
  "Running_Treadmill",
  "Dumbbell_Bench_Press",
  "Deadlift",
];
console.log("\nSample links (exercise → substitutes):");
for (const { exercise, substitutes } of substitutions) {
  if (!sampleCodes.includes(exercise)) continue;
  const name = (c) => byCode.get(c)?.name ?? c;
  console.log(`\n• ${name(exercise)}  [${exercise}]`);
  for (const s of substitutes) {
    const se = byCode.get(s);
    console.log(`    → ${se?.name}  (${se?.equipment ?? "—"})`);
  }
}
