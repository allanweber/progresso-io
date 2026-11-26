import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DATA = join(process.cwd(), "drizzle", "data");
const PT_BR = join(DATA, "opengym", "exercises-ptbr.json");
const CATALOG = join(DATA, "exercises-catalog.ndjson.gz");
const SUBSTITUTIONS = join(DATA, "exercise-substitutions.json");
const CLASSIC = new Set(JSON.parse(readFileSync(join(DATA, "opengym", "classic-ids.json"), "utf8")));
const MAX_SUBSTITUTES = 4;

const BODY_MAP_ALIAS = {
  abs: ["abs"],
  pectorals: ["chest"],
  biceps: ["biceps"],
  glutes: ["gluteal"],
  delts: ["front-delts", "side-delts", "rear-delts"],
  "front delts": ["front-delts"],
  "side delts": ["side-delts"],
  "rear delts": ["rear-delts"],
  triceps: ["triceps"],
  "upper back": ["upper-back"],
  lats: ["lats"],
  calves: ["calves"],
  quads: ["quadriceps"],
  forearms: ["forearm"],
  hamstrings: ["hamstring"],
  spine: ["lower-back"],
  traps: ["trapezius"],
  adductors: ["adductors"],
  "serratus anterior": ["serratus"],
  abductors: ["gluteal"],
  "levator scapulae": ["trapezius"],
  shoulders: ["front-delts", "side-delts", "rear-delts"],
  deltoids: ["front-delts", "side-delts", "rear-delts"],
  "rear deltoids": ["rear-delts"],
  "rotator cuff": ["rear-delts"],
  quadriceps: ["quadriceps"],
  core: ["abs"],
  abdominals: ["abs"],
  "lower abs": ["abs"],
  chest: ["chest"],
  "upper chest": ["chest"],
  "hip flexors": ["hip-flexors"],
  obliques: ["obliques"],
  "lower back": ["lower-back"],
  rhomboids: ["upper-back"],
  trapezius: ["trapezius"],
  back: ["upper-back"],
  "latissimus dorsi": ["lats"],
  brachialis: ["biceps"],
  soleus: ["calves"],
  shins: ["tibialis"],
  wrists: ["forearm"],
  "wrist flexors": ["forearm"],
  "wrist extensors": ["forearm"],
  "grip muscles": ["forearm"],
  groin: ["adductors"],
  "inner thighs": ["adductors"],
};

const STAPLES = new Set([
  "0025", "0047", "0289", "0314", "0251", "0155", "0308", "0662", "0596", "0576",
  "0652", "1326", "0198", "0027", "0861", "0032", "0292", "0293", "0606",
  "0043", "3593", "0739", "0585", "0586", "0599", "0085", "0336", "1060", "0605", "1372",
  "1162", "0405", "0334", "0178",
  "0031", "0294", "0313", "2249", "0060", "0061",
  "0274", "0463", "0472", "0175",
]);
const EQUIPMENT_PRIOR = {
  barbell: 4,
  dumbbell: 4,
  cable: 3,
  "leverage machine": 3,
  "body weight": 3,
  "smith machine": 2,
  kettlebell: 2,
  "ez barbell": 2,
  "sled machine": 2,
};
const CATEGORY_PRIOR = {
  strength: 3,
  calisthenics: 3,
  olympic: 2,
  plyometrics: 1,
  isometric: 1,
  stretching: -3,
  mobility: -3,
  rehab: -4,
  yoga: -2,
  pilates: -2,
};
const EVERYDAY = { "0739": 6 };

function popularity(e) {
  return (
    (STAPLES.has(e.id) ? 6 : 0) +
    (CLASSIC.has(e.id) ? 3 : 0) +
    (EQUIPMENT_PRIOR[e.equipment] ?? 0) +
    (CATEGORY_PRIOR[e.category] ?? 0) +
    (EVERYDAY[e.id] ?? 0)
  );
}

const FAMILIES = {
  "flat press": ["0025", "0289", "1254", "0151", "0576", "0577", "0748", "0662"],
  "incline press": ["0047", "0314", "4544", "0169", "0757"],
  "decline press": ["0033", "0301", "0753"],
  "overhead press": ["0997", "0219", "0405", "0587", "1454", "0603", "0765", "0766"],
  row: ["3899", "0027", "3859", "3896", "0861", "0293", "1350", "1359"],
  "vertical pull": ["0198", "1326", "0652"],
  deadlift: ["4618", "0032", "0157", "0300", "3322", "0578", "0752"],
  "romanian deadlift": ["0085", "6552", "1459", "4861"],
  squat: ["1004", "0042", "3593", "3349", "2966", "0413", "0533", "10673", "1595", "0770", "1197"],
  lunge: ["0054", "3351", "0336"],
  curl: ["4063", "0031", "0868", "0294", "5857", "4336"],
  "hammer curl": ["0897", "0166", "0313"],
  pushdown: ["1502", "0201"],
  "lying triceps extension": ["0061", "0187", "0351"],
  "leg curl": ["0911", "6161", "0586", "0599"],
  "calf raise": ["0894", "1372", "1375", "0417", "5854", "0605"],
  "lateral raise": ["0907", "0178", "0334", "3740", "0584"],
};
const FAMILY_OF = new Map(Object.entries(FAMILIES).flatMap(([name, ids]) => ids.map((id) => [id, name])));

const NAME_NOISE = new Set(
  "a an and the of on in with to for from at by one two single arm arms leg legs alternate alternating " +
    "dumbbell dumbbells barbell cable band bands lever leverage machine smith kettlebell body weight weighted " +
    "assisted ez bar sled resistance stability ball medicine bosu olympic trap rope roller suspension sandbag " +
    "landmine plate v female male version variation".split(" "),
);

function movementWords(name) {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NAME_NOISE.has(w)),
  );
}

const LIFTING = new Set(["strength", "calisthenics", "olympic", "plyometrics", "isometric"]);

function capitalize(text) {
  const t = (text ?? "").trim();
  return t ? t[0].toLocaleUpperCase("pt-BR") + t.slice(1) : t;
}

function bodyMap(e) {
  const map = rawBodyMap(e);
  const given = e.muscleMap?.weights ?? {};
  const weights = {};
  for (const m of map.primaries) weights[m] = given[m] ?? 1;
  for (const m of map.secondaries) weights[m] = given[m] ?? 0.4;
  for (const m of Object.keys(weights)) if (!(weights[m] > 0)) delete weights[m];
  return {
    primaries: map.primaries.filter((m) => weights[m]),
    secondaries: map.secondaries.filter((m) => weights[m]),
    weights,
  };
}

function rawBodyMap(e) {
  if (e.muscleMap?.primaries?.length) {
    const primaries = [...new Set(e.muscleMap.primaries)];
    const secondaries = [...new Set(e.muscleMap.secondaries ?? [])].filter((m) => !primaries.includes(m));
    return { primaries, secondaries };
  }
  const primaries = [...new Set(BODY_MAP_ALIAS[e.target] ?? [])];
  const secondaries = [...new Set(e.secondaryMuscles.flatMap((m) => BODY_MAP_ALIAS[m] ?? []))].filter(
    (m) => !primaries.includes(m),
  );
  return { primaries, secondaries };
}

function media(id) {
  return { image: `still/${id}.webp`, video: `clip/${id}.mp4` };
}

function family(category) {
  return LIFTING.has(category) ? "lifting" : category;
}

function substitutesOf(e, byTarget) {
  const own = new Set(e.secondaryMuscles);
  const words = movementWords(e.name);
  const fam = FAMILY_OF.get(e.id);
  const score = (c) =>
    (fam && FAMILY_OF.get(c.id) === fam ? 20 : 0) +
    [...movementWords(c.name)].filter((w) => words.has(w)).length * 4 +
    (c.bodyPart === e.bodyPart ? 2 : 0) +
    c.secondaryMuscles.filter((m) => own.has(m)).length;
  const candidates = (byTarget.get(e.target) ?? [])
    .filter((c) => c.id !== e.id && family(c.category) === family(e.category) && !c.hold === !e.hold)
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const other = candidates.filter((c) => c.equipment !== e.equipment).slice(0, 2);
  const same = candidates.filter((c) => c.equipment === e.equipment);
  return [...other, ...same, ...candidates]
    .filter((c, i, all) => all.indexOf(c) === i)
    .slice(0, MAX_SUBSTITUTES)
    .map((c) => c.id);
}

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/build-exercise-catalog.mjs <openGym catalogue/exercises directory>");
  process.exit(1);
}

const all = readdirSync(dir)
  .filter((f) => /^\d{4,5}\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const byId = new Map(all.map((e) => [e.id, e]));
const main = all.filter((e) => !e.variantOf).sort((a, b) => a.id.localeCompare(b.id));
const ptBr = JSON.parse(readFileSync(PT_BR, "utf8"));

const problems = main.filter((e) => !ptBr[e.id]).map((e) => e.id);
if (problems.length) {
  console.error(`Missing pt-BR text for ${problems.length} exercises: ${problems.slice(0, 10).join(", ")}`);
  process.exit(1);
}

const rows = main.map((e) => {
  const pt = ptBr[e.id];
  const map = bodyMap(e);
  const female = e.femaleVariant && byId.get(e.femaleVariant) ? media(e.femaleVariant) : null;
  const own = media(e.id);
  return {
    code: e.id,
    name: capitalize(pt.name),
    nameEn: capitalize(e.name),
    description: pt.description || null,
    descriptionEn: e.description || null,
    bodyPart: e.bodyPart,
    category: e.category,
    equipment: e.equipment,
    machineKind: e.machineKind ?? null,
    target: e.target,
    secondaryMuscles: e.secondaryMuscles,
    mapPrimary: map.primaries,
    mapSecondary: map.secondaries,
    muscleWeights: map.weights,
    needs: e.needs ?? [],
    hold: e.hold === true,
    track: e.track ?? null,
    instructions: pt.instructions,
    instructionsEn: e.instructions,
    image: own.image,
    video: own.video,
    femaleImage: female?.image ?? null,
    femaleVideo: female?.video ?? null,
    classic: CLASSIC.has(e.id),
    popularity: popularity(e),
  };
});

const byTarget = new Map();
for (const e of main) {
  if (!byTarget.has(e.target)) byTarget.set(e.target, []);
  byTarget.get(e.target).push(e);
}
const substitutions = main
  .map((e) => ({ exercise: e.id, substitutes: substitutesOf(e, byTarget) }))
  .filter((r) => r.substitutes.length);

writeFileSync(CATALOG, gzipSync(rows.map((r) => JSON.stringify(r)).join("\n") + "\n"));
writeFileSync(SUBSTITUTIONS, JSON.stringify({ substitutions }, null, 1) + "\n");
console.log(
  `✓ ${rows.length} exercises (${rows.filter((r) => r.femaleImage).length} with female media), ` +
    `${substitutions.reduce((n, r) => n + r.substitutes.length, 0)} substitutions.`,
);
