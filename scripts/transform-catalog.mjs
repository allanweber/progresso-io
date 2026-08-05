// Transforms the raw TBCA dump (`alimentos.json`, a stream of concatenated JSON
// objects) into the compact, normalized artifact the seed loads:
// `drizzle/data/food-catalog.ndjson.gz`.
//
// Run at dev time when the source changes:  node scripts/transform-catalog.mjs
//
// Normalizations applied here (see docs/food-catalog.md):
//   - decimal comma -> dot, parsed to number
//   - "NA"/"-" -> null (unmeasured), "tr" -> null + isTrace (measured trace)
//   - long nutrient list -> canonical nutrient ids (dedup per food, keep first)
//   - cholesterol always mg (the "g" unit in the source is a mislabel)
//   - classes canonicalized (case/accent variants merged) into food groups
//   - type (ingrediente/preparacao) derived heuristically
//   - the 6 "hot" macros denormalized onto each food
//   - foods sharing an identical description flagged needsReview
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const SRC = join(process.cwd(), "alimentos.json");
const OUT_DIR = join(process.cwd(), "drizzle", "data");
const OUT = join(OUT_DIR, "food-catalog.ndjson.gz");

/**
 * Canonical nutrient dimension. `match` lists the "Componente|Unidade" keys
 * from the TBCA source that map to this nutrient. Order here is the display
 * order (sort_order). `hot` maps a nutrient to its denormalized `food` column.
 */
const NUTRIENTS = [
  { id: "energy_kcal", label: "Energia", unit: "kcal", kind: "energy", match: ["Energia|kcal"], hot: "energyKcal" },
  { id: "energy_kj", label: "Energia", unit: "kJ", kind: "energy", match: ["Energia|kJ"] },
  { id: "protein", label: "Proteína", unit: "g", kind: "macro", match: ["Proteína|g"], hot: "protein" },
  { id: "protein_animal", label: "Proteína animal", unit: "g", kind: "macro", match: ["Proteína animal|g"] },
  { id: "protein_vegetable", label: "Proteína vegetal", unit: "g", kind: "macro", match: ["Proteína vegetal|g"] },
  { id: "carbohydrate", label: "Carboidrato total", unit: "g", kind: "macro", match: ["Carboidrato total|g"], hot: "carbohydrate" },
  { id: "carbohydrate_available", label: "Carboidrato disponível", unit: "g", kind: "macro", match: ["Carboidrato disponível|g"] },
  { id: "fiber", label: "Fibra alimentar", unit: "g", kind: "macro", match: ["Fibra alimentar|g"], hot: "fiber" },
  { id: "fat", label: "Lipídios", unit: "g", kind: "macro", match: ["Lipídios|g"], hot: "fat" },
  { id: "cholesterol", label: "Colesterol", unit: "mg", kind: "macro", match: ["Colesterol|mg", "Colesterol|g"] },
  { id: "fatty_acids_saturated", label: "Ácidos graxos saturados", unit: "g", kind: "fatty_acid", match: ["Ácidos graxos saturados|g"] },
  { id: "fatty_acids_monounsaturated", label: "Ácidos graxos monoinsaturados", unit: "g", kind: "fatty_acid", match: ["Ácidos graxos monoinsaturados|g"] },
  { id: "fatty_acids_polyunsaturated", label: "Ácidos graxos poliinsaturados", unit: "g", kind: "fatty_acid", match: ["Ácidos graxos poliinsaturados|g"] },
  { id: "fatty_acids_trans", label: "Ácidos graxos trans", unit: "g", kind: "fatty_acid", match: ["Ácidos graxos trans|g"] },
  { id: "alcohol", label: "Álcool", unit: "g", kind: "other", match: ["Álcool|g"] },
  { id: "humidity", label: "Umidade", unit: "g", kind: "other", match: ["Umidade|g"] },
  { id: "ash", label: "Cinzas", unit: "g", kind: "other", match: ["Cinzas|g"] },
  { id: "sugar_added", label: "Açúcar de adição", unit: "g", kind: "other", match: ["Açúcar de adição|g"] },
  { id: "fat_added", label: "Gordura de adição", unit: "g", kind: "other", match: ["Gordura de adição|g"] },
  { id: "salt_added", label: "Sal de adição", unit: "g", kind: "other", match: ["Sal de adição|g"] },
  { id: "calcium", label: "Cálcio", unit: "mg", kind: "mineral", match: ["Cálcio|mg"] },
  { id: "iron", label: "Ferro", unit: "mg", kind: "mineral", match: ["Ferro|mg"] },
  { id: "sodium", label: "Sódio", unit: "mg", kind: "mineral", match: ["Sódio|mg"], hot: "sodium" },
  { id: "magnesium", label: "Magnésio", unit: "mg", kind: "mineral", match: ["Magnésio|mg"] },
  { id: "phosphorus", label: "Fósforo", unit: "mg", kind: "mineral", match: ["Fósforo|mg"] },
  { id: "potassium", label: "Potássio", unit: "mg", kind: "mineral", match: ["Potássio|mg"] },
  { id: "zinc", label: "Zinco", unit: "mg", kind: "mineral", match: ["Zinco|mg"] },
  { id: "copper", label: "Cobre", unit: "mg", kind: "mineral", match: ["Cobre|mg"] },
  { id: "selenium", label: "Selênio", unit: "mcg", kind: "mineral", match: ["Selênio|mcg"] },
  { id: "vitamin_a_re", label: "Vitamina A (RE)", unit: "mcg", kind: "vitamin", match: ["Vitamina A (RE)|mcg"] },
  { id: "vitamin_a_rae", label: "Vitamina A (RAE)", unit: "mcg", kind: "vitamin", match: ["Vitamina A (RAE)|mcg"] },
  { id: "vitamin_d", label: "Vitamina D", unit: "mcg", kind: "vitamin", match: ["Vitamina D|mcg"] },
  { id: "vitamin_e", label: "Alfa-tocoferol (Vitamina E)", unit: "mg", kind: "vitamin", match: ["Alfa-tocoferol (Vitamina E)|mg"] },
  { id: "thiamin", label: "Tiamina", unit: "mg", kind: "vitamin", match: ["Tiamina|mg"] },
  { id: "riboflavin", label: "Riboflavina", unit: "mg", kind: "vitamin", match: ["Riboflavina|mg"] },
  { id: "niacin", label: "Niacina", unit: "mg", kind: "vitamin", match: ["Niacina|mg"] },
  { id: "vitamin_b6", label: "Vitamina B6", unit: "mg", kind: "vitamin", match: ["Vitamina B6|mg"] },
  { id: "vitamin_b12", label: "Vitamina B12", unit: "mcg", kind: "vitamin", match: ["Vitamina B12|mcg"] },
  { id: "vitamin_c", label: "Vitamina C", unit: "mg", kind: "vitamin", match: ["Vitamina C|mg"] },
  { id: "folate", label: "Equivalente de folato", unit: "mcg", kind: "vitamin", match: ["Equivalente de folato|mcg"] },
];

/** "Componente|Unidade" -> canonical nutrient id. */
const BY_SOURCE = new Map();
for (const n of NUTRIENTS) for (const key of n.match) BY_SOURCE.set(key, n.id);
const HOT = NUTRIENTS.filter((n) => n.hot);

const stripAccents = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalizeKey = (s) => stripAccents(s).toLowerCase().trim();
const slugify = (s) =>
  normalizeKey(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Splits a stream of concatenated JSON objects (string-safe brace counting). */
function parseConcatenated(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) out.push(JSON.parse(text.slice(start, i + 1)));
    }
  }
  return out;
}

/** "66,2" -> {value: 66.2}. "NA"/"-" -> null. "tr" -> null + trace. */
function parseValue(raw) {
  const s = String(raw).trim();
  if (s === "tr") return { value: null, isTrace: true };
  if (s === "NA" || s === "-" || s === "") return { value: null, isTrace: false };
  const n = Number(s.replace(",", "."));
  return { value: Number.isNaN(n) ? null : n, isTrace: false };
}

/** Heuristic: composite dish vs single ingredient (mirrors the audit). */
function classifyType(descRaw) {
  const d = normalizeKey(descRaw);
  const noteParen = /\((media|dados|valor|diferentes|corte|amostra|cultivar)[^)]*\)/;
  const recipeParen = /\([^)]*,[^)]*\)/.test(d) && !noteParen.test(d);
  const plus = / \+ /.test(d);
  const kw =
    /caseir|receita|prato de comida|c\/ molho|^salada,|recheio|papa de|^sopa|^pizza|^torta|^bolo|fricass|estrogonofe|escondidinho|feijoada|lasanha|^panqueca|risoto|quibe|almondega|hamburguer|sanduiche|vatapa|moqueca|mariscada/.test(
      d,
    );
  return recipeParen || plus || kw ? "preparacao" : "ingrediente";
}

const raw = parseConcatenated(readFileSync(SRC, "utf8"));

// --- groups: canonical name = the most frequent variant per normalized key ---
const groupCounts = new Map(); // normKey -> Map(originalName -> count)
for (const f of raw) {
  const key = normalizeKey(f.classe);
  if (!groupCounts.has(key)) groupCounts.set(key, new Map());
  const m = groupCounts.get(key);
  m.set(f.classe, (m.get(f.classe) ?? 0) + 1);
}
const groupByKey = new Map(); // normKey -> {name, slug}
for (const [key, variants] of groupCounts) {
  const name = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
  groupByKey.set(key, { name, slug: slugify(name) });
}

// --- duplicate descriptions -> needsReview ---
const descCounts = new Map();
for (const f of raw) descCounts.set(f.descricao, (descCounts.get(f.descricao) ?? 0) + 1);

// --- build food + nutrient lines ---
const foodLines = [];
let nutrientRows = 0;
let dedupedDup = 0;
for (const f of raw) {
  const seen = new Map(); // nutrientId -> {value, isTrace} (first wins)
  for (const row of f.nutrientes) {
    const id = BY_SOURCE.get(`${row.Componente}|${row.Unidades}`);
    if (!id) continue;
    if (seen.has(id)) {
      dedupedDup++;
      continue;
    }
    seen.set(id, parseValue(row["Valor por 100g"]));
  }
  const macros = {};
  for (const n of HOT) macros[n.hot] = seen.get(n.id)?.value ?? null;
  const nutrients = [...seen.entries()].map(([id, v]) => [id, v.value, v.isTrace]);
  nutrientRows += nutrients.length;
  foodLines.push({
    kind: "food",
    code: f.codigo,
    description: f.descricao.replace(/\s+/g, " ").replace(/,\s*$/, "").trim(),
    groupSlug: groupByKey.get(normalizeKey(f.classe)).slug,
    type: classifyType(f.descricao),
    needsReview: (descCounts.get(f.descricao) ?? 0) > 1,
    ...macros,
    nutrients,
  });
}

const meta = {
  kind: "meta",
  groups: [...groupByKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
  nutrients: NUTRIENTS.map((n, i) => ({
    id: n.id,
    label: n.label,
    unit: n.unit,
    kind: n.kind,
    sortOrder: i,
  })),
};

const ndjson =
  [meta, ...foodLines].map((o) => JSON.stringify(o)).join("\n") + "\n";
mkdirSync(OUT_DIR, { recursive: true });
const gz = gzipSync(Buffer.from(ndjson, "utf8"), { level: 9 });
writeFileSync(OUT, gz);

console.info(
  `foods=${foodLines.length} groups=${meta.groups.length} nutrients=${meta.nutrients.length} ` +
    `nutrient_rows=${nutrientRows} deduped_dupes=${dedupedDup}`,
);
console.info(
  `type: ingrediente=${foodLines.filter((f) => f.type === "ingrediente").length} ` +
    `preparacao=${foodLines.filter((f) => f.type === "preparacao").length} ` +
    `needsReview=${foodLines.filter((f) => f.needsReview).length}`,
);
console.info(
  `raw=${(readFileSync(SRC).length / 1048576).toFixed(1)}MB -> gz=${(gz.length / 1048576).toFixed(2)}MB`,
);
