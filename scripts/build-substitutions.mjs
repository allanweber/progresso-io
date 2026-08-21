// Dev-time generator: builds a curated list of BASE food substitutions from the
// seed data (TACO catalog + supplement) into drizzle/data/taco-substitutions.json.
//
// A substitution is a directed edge: `grams` of the substitute ≡ 100 g of the
// main food. Within each role group we generate every directed pair, and size
// `grams` ISOCALORICALLY — grams = 100 * kcal(main) / kcal(substitute), rounded
// and clamped — so the swap delivers ~the same energy as 100 g of the main food.
// Foods are referenced by their unique `code` (stable across the seed).
//
// Run: pnpm db:build-substitutions
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

const CATALOG = join(process.cwd(), "drizzle", "data", "taco-catalog.ndjson.gz");
const SUPPLEMENT = join(process.cwd(), "drizzle", "data", "taco-supplement.json");
const OUT = join(process.cwd(), "drizzle", "data", "taco-substitutions.json");

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ------------------------------ load foods ------------------------------- */

const catalog = gunzipSync(readFileSync(CATALOG))
  .toString("utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .slice(1); // drop meta
const supplement = JSON.parse(readFileSync(SUPPLEMENT, "utf8")).foods;

/** Unified {code, description, kcal}. Supplement rows use sourceCode. */
const foods = [
  ...catalog.map((f) => ({ code: f.code, description: f.description, kcal: f.energyKcal })),
  ...supplement.map((f) => ({ code: f.sourceCode, description: f.description, kcal: f.energyKcal })),
].filter((f) => f.code);

/** Resolve a search term to one food: every token must appear; shortest wins. */
function find(term) {
  const tokens = norm(term).split(/\s+/).filter(Boolean);
  const hits = foods.filter((f) => {
    const d = norm(f.description);
    return tokens.every((t) => d.includes(t));
  });
  hits.sort((a, b) => a.description.length - b.description.length);
  return hits[0];
}

/* ----------------------------- role groups ------------------------------- */
// Each member is a search term resolved against the seed. Within a group every
// ordered pair becomes a directed substitution.
const GROUPS = [
  {
    name: "Cereais e tubérculos (cozidos)",
    members: [
      "arroz integral cozido",
      "arroz tipo 1 cozido",
      "batata doce cozida",
      "mandioca cozida",
      "cuscuz milho cozido com sal",
      "inhame cozido",
      "cará cozido",
      "polenta",
    ],
  },
  {
    name: "Proteínas magras (prontas)",
    members: [
      "frango peito sem pele grelhado",
      "frango peito sem pele cozido",
      "carne bovina patinho sem gordura grelhado",
      "carne bovina coxão mole sem gordura cozido",
      "ovo galinha inteiro cozido",
      "atum conserva óleo",
    ],
  },
  {
    name: "Leguminosas (cozidas)",
    members: [
      "feijão carioca cozido",
      "feijão preto cozido",
      "lentilha cozida",
      "grão-de-bico cozido",
      "ervilha cozida",
    ],
  },
  {
    name: "Gorduras e óleos",
    members: [
      "azeite oliva extra virgem",
      "óleo de coco",
      "óleo de soja",
      "manteiga com sal",
      "ghee",
    ],
  },
  {
    name: "Leites e iogurtes",
    members: [
      "leite de vaca integral",
      "leite de vaca desnatado",
      "iogurte natural",
      "iogurte natural desnatado",
      "iogurte grego natural integral",
      "coalhada integral",
    ],
  },
  {
    name: "Queijos cremosos",
    members: [
      "cream cheese",
      "cream cheese light",
      "queijo requeijão cremoso",
      "requeijão light",
    ],
  },
  {
    name: "Pastas de oleaginosas",
    members: [
      "pasta de amendoim integral",
      "manteiga de amêndoas",
      "pasta de castanha de caju",
      "tahine pasta de gergelim",
    ],
  },
  {
    name: "Sementes",
    members: [
      "chia semente seca",
      "linhaça semente",
      "semente de girassol",
      "semente de abóbora",
      "gergelim semente",
    ],
  },
  {
    name: "Oleaginosas",
    members: [
      "castanha-do-brasil crua",
      "castanha-de-caju torrada salgada",
      "amêndoa torrada salgada",
      "amendoim grão cru",
      "pistache cru",
      "macadâmia crua",
      "noz crua",
    ],
  },
  {
    name: "Frutas doces",
    members: [
      "banana nanica crua",
      "maçã fuji com casca crua",
      "mamão formosa cru",
      "manga palmer crua",
      "pera williams crua",
      "uva itália crua",
    ],
  },
  {
    name: "Frutas vermelhas",
    members: [
      "morango cru",
      "mirtilo blueberry",
      "framboesa",
      "amora-preta",
    ],
  },
  {
    name: "Adoçantes",
    members: ["açúcar cristal", "açúcar mascavo", "mel de abelha"],
  },
  {
    name: "Farinhas alternativas",
    members: [
      "farinha de aveia",
      "aveia flocos crua",
      "farinha de amêndoas",
      "farinha de coco",
    ],
  },
];

/* ------------------------------- build ----------------------------------- */

const substitutions = [];
const seen = new Set();
const report = [];
const unresolved = [];

function isocaloricGrams(mainKcal, subKcal) {
  if (!mainKcal || !subKcal) return 100; // no energy data → 1:1 by weight
  const g = Math.round((100 * mainKcal) / subKcal);
  return Math.min(400, Math.max(10, g));
}

for (const group of GROUPS) {
  const resolved = [];
  for (const term of group.members) {
    const f = find(term);
    if (!f) {
      unresolved.push(`${group.name} :: ${term}`);
      continue;
    }
    if (resolved.some((r) => r.code === f.code)) continue; // de-dupe within group
    resolved.push(f);
  }
  report.push(`\n### ${group.name} (${resolved.length})`);
  for (const r of resolved) report.push(`   [${r.code}] ${r.description} · ${r.kcal ?? "?"} kcal`);

  // Every ordered pair within the group.
  for (const main of resolved) {
    for (const sub of resolved) {
      if (main.code === sub.code) continue;
      const key = `${main.code}->${sub.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      substitutions.push({
        food: main.description,
        substitute: sub.description,
        grams: isocaloricGrams(main.kcal, sub.kcal),
        group: group.name,
      });
    }
  }
}

const doc = {
  _comment:
    "Base food substitutions (shared, no clinic). Directed: `grams` of `substitute` ≡ 100 g of `food`, sized isocalorically within each role group. Foods referenced by their exact catalog description. Review artifact — not wired into the seed.",
  count: substitutions.length,
  substitutions,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2));

console.log(report.join("\n"));
console.log(`\n✓ ${substitutions.length} directed substitutions across ${GROUPS.length} groups.`);
if (unresolved.length) {
  console.log(`\n⚠ UNRESOLVED (${unresolved.length}):`);
  unresolved.forEach((u) => console.log("   " + u));
}
