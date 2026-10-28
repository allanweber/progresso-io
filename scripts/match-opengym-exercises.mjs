import { existsSync, writeFileSync } from "node:fs";
import {
  EXERCISEDB_EQUIPMENT,
  EXERCISEDB_FILE,
  EXERCISEDB_TARGET,
  FREE_DB_FILE,
  MATCHES_FILE,
  readJson,
  slug,
} from "./lib/exercisedb-vocab.mjs";
import { MODEL, askJson, inBatches, requireKey } from "./lib/openrouter.mjs";

const CANDIDATES = 8;
const MIN_SCORE = 0.2;
const BATCH = 15;
const CONCURRENCY = 4;
const STOP = new Set(["a", "an", "the", "with", "on", "of", "to", "and", "for", "in", "your"]);

const tokens = (name) =>
  new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w && !STOP.has(w))
      .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  );

const jaccard = (a, b) => {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter ? inter / (a.size + b.size - inter) : 0;
};

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const incoming = readJson(EXERCISEDB_FILE);
const ours = readJson(FREE_DB_FILE).map((e) => ({
  code: e.id,
  name: e.name,
  equipment: e.equipment ? slug(e.equipment) : null,
  category: e.category,
  primaryMuscles: (e.primaryMuscles ?? []).map(slug),
  tokens: tokens(e.name),
}));

function candidatesFor(x) {
  const t = tokens(x.name);
  const equipment = EXERCISEDB_EQUIPMENT[x.equipment] ?? null;
  const target = EXERCISEDB_TARGET[x.target] ?? null;
  return ours
    .map((o) => ({
      o,
      score:
        jaccard(t, o.tokens) +
        (equipment && o.equipment === equipment ? 0.3 : 0) +
        (target && o.primaryMuscles.includes(target) ? 0.2 : 0),
      exact: sameSet(t, o.tokens) && (!equipment || o.equipment === equipment),
    }))
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES);
}

const previous = existsSync(MATCHES_FILE) ? readJson(MATCHES_FILE).matches : [];
const decided = new Map(previous.map((m) => [m.openGymId, m]));
const byCode = new Map(ours.map((o) => [o.code, o]));

const pending = [];
for (const x of incoming) {
  if (decided.has(x.id)) continue;
  const cands = candidatesFor(x);
  const exact = cands.find((c) => c.exact);
  if (exact) {
    decided.set(x.id, { openGymId: x.id, name: x.name, code: exact.o.code, ourName: exact.o.name, method: "exact" });
  } else if (cands.length === 0) {
    decided.set(x.id, { openGymId: x.id, name: x.name, code: null, ourName: null, method: "no-candidate" });
  } else {
    pending.push({ x, cands });
  }
}

const SYSTEM = `You match gym exercises between two catalogs. For each incoming exercise you get a short list of candidates from our catalog. Pick the candidate that is THE SAME exercise: same movement, same equipment, same variant (grip, angle, stance, unilateral vs bilateral, machine type). If none is the same exercise, answer null. A similar or related exercise is NOT a match; when in doubt, answer null.
Answer with only a JSON object: {"matches": {"<incoming id>": "<candidate code>" | null, ...}} covering every incoming id.`;

const describe = ({ x, cands }) =>
  [
    `INCOMING ${x.id}: "${x.name}" · equipment: ${x.equipment} · target: ${x.target} · secondary: ${x.secondaryMuscles.join(", ") || "-"}`,
    `  first step: ${x.instructions[0] ?? "-"}`,
    ...cands.map(
      ({ o }) => `  - ${o.code}: "${o.name}" · equipment: ${o.equipment ?? "-"} · muscles: ${o.primaryMuscles.join(", ")}`,
    ),
  ].join("\n");

const save = () => {
  const matches = incoming.map((x) => decided.get(x.id)).filter(Boolean);
  writeFileSync(
    MATCHES_FILE,
    JSON.stringify(
      { generatedBy: "scripts/match-opengym-exercises.mjs", model: MODEL, matches },
      null,
      1,
    ) + "\n",
  );
};

save();
console.log(`${decided.size} decided without a model · ${pending.length} need one`);

if (pending.length) {
  requireKey();
  console.log(`Asking ${MODEL} about ${pending.length} exercises…`);
  await inBatches(pending, BATCH, CONCURRENCY, async (batch, i, total) => {
    const ids = batch.map((p) => p.x.id);
    const answer = await askJson({
      system: SYSTEM,
      user: batch.map(describe).join("\n\n"),
      validate: (a) => {
        for (const p of batch) {
          const v = a.matches?.[p.x.id];
          if (v === undefined) throw new Error(`missing ${p.x.id}`);
          if (v !== null && !p.cands.some((c) => c.o.code === v)) throw new Error(`${p.x.id} → ${v} not a candidate`);
        }
      },
    });
    for (const p of batch) {
      const code = answer.matches[p.x.id];
      decided.set(p.x.id, {
        openGymId: p.x.id,
        name: p.x.name,
        code,
        ourName: code ? byCode.get(code).name : null,
        method: "llm",
      });
    }
    save();
    console.log(`  batch ${i + 1}/${total} (${ids[0]}…${ids.at(-1)})`);
  });
}

const claims = new Map();
for (const m of decided.values()) {
  if (!m.code) continue;
  if (!claims.has(m.code)) claims.set(m.code, []);
  claims.get(m.code).push(m);
}
let released = 0;
const rank = { exact: 0, llm: 1 };
for (const list of claims.values()) {
  if (list.length < 2) continue;
  const x = (id) => incoming.find((e) => e.id === id);
  const ourTokens = byCode.get(list[0].code).tokens;
  list.sort(
    (a, b) =>
      rank[a.method] - rank[b.method] ||
      jaccard(tokens(x(b.openGymId).name), ourTokens) - jaccard(tokens(x(a.openGymId).name), ourTokens),
  );
  for (const loser of list.slice(1)) {
    decided.set(loser.openGymId, { ...loser, code: null, ourName: null, method: "released-duplicate" });
    released++;
  }
}
save();

const all = [...decided.values()];
const count = (f) => all.filter(f).length;
console.log(`✓ ${MATCHES_FILE}`);
console.log(`  matched: ${count((m) => m.code)} (exact ${count((m) => m.method === "exact")}, llm ${count((m) => m.method === "llm" && m.code)})`);
console.log(`  new exercises: ${count((m) => !m.code)} (released duplicate claims: ${released})`);
