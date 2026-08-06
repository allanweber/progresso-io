// Dev-time transformer: turns the normalized TACO CSVs (NEPA/UNICAMP 4th ed.,
// from brolesi/taco — see drizzle/data/taco-src/SOURCE.md) into the compact
// gzipped NDJSON the deploy seed consumes (drizzle/data/taco-catalog.ndjson.gz).
//
// Output format (same shape the seed in scripts/migrate.mjs reads):
//   line 0  = meta  { groups:[{name,slug}], nutrients:[{id,label,unit,kind,sortOrder}] }
//   line 1+ = food  { code, description, groupSlug, type, energyKcal, protein,
//                     carbohydrate, fat, fiber, sodium, needsReview,
//                     nutrients:[[nutrientId, value|null, isTrace], ...] }
//
// Value convention (from the source): an empty cell is unmeasured → no
// food_nutrient row (read as null). `1e-05` is a measured trace ("Tr") →
// a row with value=null and isTrace=true. Everything else is a number.
//
// Run: npm run db:transform-taco
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const SRC = join(process.cwd(), "drizzle", "data", "taco-src");
const OUT = join(process.cwd(), "drizzle", "data", "taco-catalog.ndjson.gz");

/** Sentinel the source uses for a measured trace ("Tr"). */
const TRACE = 1e-5;

/* --------------------------------- CSV ----------------------------------- */

/** Parses CSV text into an array of string[] rows (RFC-4180 quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

/** Reads a source CSV into { header, rows: Array<Record<col,string>> }. */
function readCsv(name) {
  const rows = parseCsv(readFileSync(join(SRC, name), "utf8"));
  const header = rows[0];
  const records = rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => (o[h] = r[i] ?? ""));
    return o;
  });
  return records;
}

/* ------------------------------ nutrients -------------------------------- */

// Every nutrient dimension, in display order. `col` is the CSV column it maps
// from; `hot` (when set) is the denormalized `food` column it also fills.
// Order here defines each nutrient's sort_order.
const COMPOSITION = [
  ["energia_kcal", "energy_kcal", "Energia", "kcal", "energy", "energyKcal"],
  ["energia_kj", "energy_kj", "Energia", "kJ", "energy", null],
  ["proteina_g", "protein", "Proteína", "g", "macro", "protein"],
  ["lipideos_g", "fat", "Lipídeos", "g", "macro", "fat"],
  ["carboidrato_g", "carbohydrate", "Carboidrato", "g", "macro", "carbohydrate"],
  ["fibra_g", "fiber", "Fibra alimentar", "g", "macro", "fiber"],
  ["umidade_pct", "humidity", "Umidade", "g", "other", null],
  ["cinzas_g", "ash", "Cinzas", "g", "other", null],
  ["colesterol_mg", "cholesterol", "Colesterol", "mg", "other", null],
  ["calcio_mg", "calcium", "Cálcio", "mg", "mineral", null],
  ["magnesio_mg", "magnesium", "Magnésio", "mg", "mineral", null],
  ["manganes_mg", "manganese", "Manganês", "mg", "mineral", null],
  ["fosforo_mg", "phosphorus", "Fósforo", "mg", "mineral", null],
  ["ferro_mg", "iron", "Ferro", "mg", "mineral", null],
  ["sodio_mg", "sodium", "Sódio", "mg", "mineral", "sodium"],
  ["potassio_mg", "potassium", "Potássio", "mg", "mineral", null],
  ["cobre_mg", "copper", "Cobre", "mg", "mineral", null],
  ["zinco_mg", "zinc", "Zinco", "mg", "mineral", null],
  ["retinol_mcg", "retinol", "Retinol", "mcg", "vitamin", null],
  ["RE_mcg", "vitamin_a_re", "Vitamina A (RE)", "mcg", "vitamin", null],
  ["RAE_mcg", "vitamin_a_rae", "Vitamina A (RAE)", "mcg", "vitamin", null],
  ["tiamina_mg", "thiamine", "Tiamina (B1)", "mg", "vitamin", null],
  ["riboflavina_mg", "riboflavin", "Riboflavina (B2)", "mg", "vitamin", null],
  ["piridoxina_mg", "pyridoxine", "Piridoxina (B6)", "mg", "vitamin", null],
  ["niacina_mg", "niacin", "Niacina", "mg", "vitamin", null],
  ["vitamina_c_mg", "vitamin_c", "Vitamina C", "mg", "vitamin", null],
];

const FATTY_ACIDS = [
  ["saturados_g", "fa_saturated", "Saturados (total)"],
  ["monoinsaturados_g", "fa_monounsaturated", "Monoinsaturados (total)"],
  ["poliinsaturados_g", "fa_polyunsaturated", "Poli-insaturados (total)"],
  ["c12_0_g", "fa_12_0", "Láurico (12:0)"],
  ["c14_0_g", "fa_14_0", "Mirístico (14:0)"],
  ["c16_0_g", "fa_16_0", "Palmítico (16:0)"],
  ["c18_0_g", "fa_18_0", "Esteárico (18:0)"],
  ["c20_0_g", "fa_20_0", "Araquídico (20:0)"],
  ["c22_0_g", "fa_22_0", "Behênico (22:0)"],
  ["c24_0_g", "fa_24_0", "Lignocérico (24:0)"],
  ["c14_1_g", "fa_14_1", "Miristoleico (14:1)"],
  ["c16_1_g", "fa_16_1", "Palmitoleico (16:1)"],
  ["c18_1_g", "fa_18_1", "Oleico (18:1)"],
  ["c20_1_g", "fa_20_1", "Gadoleico (20:1)"],
  ["c18_2n6_g", "fa_18_2n6", "Linoleico (18:2 n-6)"],
  ["c18_3n3_g", "fa_18_3n3", "Alfa-linolênico (18:3 n-3)"],
  ["c20_4_g", "fa_20_4", "Araquidônico (20:4)"],
  ["c20_5_g", "fa_20_5", "EPA (20:5)"],
  ["c22_5_g", "fa_22_5", "DPA (22:5)"],
  ["c22_6_g", "fa_22_6", "DHA (22:6)"],
  ["c18_1t_g", "fa_18_1t", "Trans 18:1"],
  ["c18_2t_g", "fa_18_2t", "Trans 18:2"],
];

const AMINO_ACIDS = [
  ["triptofano_g", "aa_tryptophan", "Triptofano"],
  ["treonina_g", "aa_threonine", "Treonina"],
  ["isoleucina_g", "aa_isoleucine", "Isoleucina"],
  ["leucina_g", "aa_leucine", "Leucina"],
  ["lisina_g", "aa_lysine", "Lisina"],
  ["metionina_g", "aa_methionine", "Metionina"],
  ["cistina_g", "aa_cystine", "Cistina"],
  ["fenilalanina_g", "aa_phenylalanine", "Fenilalanina"],
  ["tirosina_g", "aa_tyrosine", "Tirosina"],
  ["valina_g", "aa_valine", "Valina"],
  ["arginina_g", "aa_arginine", "Arginina"],
  ["histidina_g", "aa_histidine", "Histidina"],
  ["alanina_g", "aa_alanine", "Alanina"],
  ["acido_aspartico_g", "aa_aspartic", "Ácido aspártico"],
  ["acido_glutamico_g", "aa_glutamic", "Ácido glutâmico"],
  ["glicina_g", "aa_glycine", "Glicina"],
  ["prolina_g", "aa_proline", "Prolina"],
  ["serina_g", "aa_serine", "Serina"],
];

/** The canonical nutrient dimension (id, label, unit, kind, sortOrder). */
function buildNutrients() {
  const out = [];
  let order = 0;
  for (const [, id, label, unit, kind] of COMPOSITION) {
    out.push({ id, label, unit, kind, sortOrder: order++ });
  }
  for (const [, id, label] of FATTY_ACIDS) {
    out.push({ id, label, unit: "g", kind: "fatty_acid", sortOrder: order++ });
  }
  for (const [, id, label] of AMINO_ACIDS) {
    out.push({ id, label, unit: "g", kind: "amino_acid", sortOrder: order++ });
  }
  return out;
}

/* ------------------------------- helpers --------------------------------- */

/** Parses a source cell → { skip } (unmeasured), a trace, or a rounded number. */
function parseCell(raw) {
  if (raw === undefined || raw.trim() === "") return { skip: true };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { skip: true };
  if (Math.abs(n - TRACE) < 1e-9) return { value: null, isTrace: true };
  // 4 significant figures — the source carries per-sample means with long tails.
  const value = n === 0 ? 0 : Number(n.toPrecision(4));
  return { value, isTrace: false };
}

/** unaccented, lowercased slug for a group name. */
function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* -------------------------------- build ---------------------------------- */

const composicao = readCsv("taco_composicao.csv");
const acidos = readCsv("taco_acidos_graxos.csv");
const aminos = readCsv("taco_aminoacidos.csv");

// Index the fatty-acid / amino-acid tables by food number for the join.
const acidosById = new Map(acidos.map((r) => [r.numero_alimento, r]));
const aminosById = new Map(aminos.map((r) => [r.numero_alimento, r]));

// Groups (from the "categoria" column) + a stable name→slug map.
const groupNames = [...new Set(composicao.map((r) => r.categoria.trim()))];
const groups = groupNames.map((name) => ({ name, slug: slugify(name) }));
const slugByName = new Map(groups.map((g) => [g.name, g.slug]));

// Foods sharing an identical description get flagged for review.
const descCount = new Map();
for (const r of composicao) {
  const d = r.descricao.trim();
  descCount.set(d, (descCount.get(d) ?? 0) + 1);
}

const nutrients = buildNutrients();

let traceRows = 0;
let valueRows = 0;

const foods = composicao.map((r) => {
  const categoria = r.categoria.trim();
  const description = r.descricao.trim();
  const rowNutrients = [];
  const hot = {
    energyKcal: null,
    protein: null,
    carbohydrate: null,
    fat: null,
    fiber: null,
    sodium: null,
  };

  const pushFrom = (record, defs) => {
    for (const [col, id] of defs) {
      const parsed = parseCell(record?.[col]);
      if (parsed.skip) continue;
      rowNutrients.push([id, parsed.value, parsed.isTrace]);
      if (parsed.isTrace) traceRows++;
      else valueRows++;
    }
  };

  // Composition (also fills the denormalized hot macros).
  for (const [col, id, , , , hotCol] of COMPOSITION) {
    const parsed = parseCell(r[col]);
    if (parsed.skip) continue;
    rowNutrients.push([id, parsed.value, parsed.isTrace]);
    if (parsed.isTrace) traceRows++;
    else valueRows++;
    if (hotCol) hot[hotCol] = parsed.value; // trace → null (column stays empty)
  }
  pushFrom(acidosById.get(r.numero_alimento), FATTY_ACIDS);
  pushFrom(aminosById.get(r.numero_alimento), AMINO_ACIDS);

  return {
    code: r.numero_alimento,
    description,
    groupSlug: slugByName.get(categoria),
    type: categoria === "Alimentos preparados" ? "preparacao" : "ingrediente",
    ...hot,
    needsReview: (descCount.get(description) ?? 0) > 1,
    nutrients: rowNutrients,
  };
});

const meta = { groups, nutrients };
const lines = [meta, ...foods].map((o) => JSON.stringify(o)).join("\n");
writeFileSync(OUT, gzipSync(Buffer.from(lines, "utf8")));

console.log(`✓ TACO catalog written: ${OUT}`);
console.log(
  `  ${foods.length} foods · ${groups.length} groups · ${nutrients.length} nutrients`,
);
console.log(`  ${valueRows} measured values · ${traceRows} traces`);
console.log(`  needs_review: ${foods.filter((f) => f.needsReview).length}`);
