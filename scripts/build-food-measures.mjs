// Dev-time generator for the curated base household measures (medidas caseiras).
// Walks every base food (the TACO composition CSV + the supplement), applies an
// ordered set of pattern rules (by food description), and writes the seed
// `drizzle/data/food-measures.json` the deploy migrator loads.
//
// Grams are approximate, well-established Brazilian household references — a
// coach/admin can add or override per food. A food accumulates measures from
// every rule that matches; the first `default: true` wins as the pre-selected
// unit. Run: npm run db:build-food-measures
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CSV = join(process.cwd(), "drizzle", "data", "taco-src", "taco_composicao.csv");
const SUPPLEMENT = join(process.cwd(), "drizzle", "data", "taco-supplement.json");
const OUT = join(process.cwd(), "drizzle", "data", "food-measures.json");

/** Minimal RFC-4180 CSV parser (quoted fields may contain commas). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Lowercase + strip accents, for accent-insensitive matching. */
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const m = (label, grams, def = false) => ({ label, grams, default: def });

/**
 * Ordered rules. `test` runs against the normalized description. Specific rules
 * come before generic ones; `stop: true` prevents later rules from also matching
 * (used where a broad keyword would otherwise double-apply).
 */
const RULES = [
  // --- Eggs ---------------------------------------------------------------
  { test: /\bovo,? de codorna/, measures: [m("unidade", 10, true)], stop: true },
  { test: /\bovo,? de galinha, (clara|gema)/, measures: [m("unidade", 17, true)], stop: true },
  { test: /\bovo,? de galinha, inteiro/, measures: [m("unidade", 50, true)], stop: true },
  { test: /\bovo,? de (pata|gansa|perua)/, measures: [m("unidade", 60, true)], stop: true },

  // --- Breads / bakery ----------------------------------------------------
  { test: /\bpao,.*forma/, measures: [m("fatia", 25, true)], stop: true },
  { test: /\bpao,.*(frances|agua e sal|careca)/, measures: [m("unidade", 50, true)], stop: true },
  { test: /\bpao de queijo/, measures: [m("unidade", 20, true)], stop: true },
  { test: /\bpao,.*(leite|doce|hamburguer|bisnaguinha|sovado)/, measures: [m("unidade", 45, true)], stop: true },
  { test: /\bpao,/, measures: [m("fatia", 30, true)], stop: true },
  { test: /\bbisnaguinha/, measures: [m("unidade", 15, true)], stop: true },
  { test: /\btorrada/, measures: [m("unidade", 8, true)], stop: true },
  { test: /\b(biscoito|bolacha),.*(cream cracker|agua e sal|maria|maisena|salgad)/, measures: [m("unidade", 7, true)], stop: true },
  { test: /\b(biscoito|bolacha),.*rech/, measures: [m("unidade", 12, true)], stop: true },
  { test: /\b(biscoito|bolacha)/, measures: [m("unidade", 8, true)], stop: true },
  { test: /\bbolo,/, measures: [m("fatia", 60, true)], stop: true },

  // A juice of any fruit is a drink, not a unit — catch it before the fruits.
  { test: /\bsuco\b/, measures: [m("copo", 200, true)], stop: true },

  // --- Fruits (specific varieties first) ----------------------------------
  { test: /\bbanana, ?(nanica|caturra)/, measures: [m("unidade", 85, true)], stop: true },
  { test: /\bbanana, ?prata/, measures: [m("unidade", 70, true)], stop: true },
  { test: /\bbanana, ?(ouro)/, measures: [m("unidade", 40, true)], stop: true },
  { test: /\bbanana, ?(maca|da terra)/, measures: [m("unidade", 110, true)], stop: true },
  { test: /\bbanana,/, measures: [m("unidade", 80, true)], stop: true },
  { test: /\bmaca,/, measures: [m("unidade", 130, true)], stop: true },
  { test: /\b(pera|pêra),/, measures: [m("unidade", 130, true)], stop: true },
  { test: /\b(laranja),/, measures: [m("unidade", 180, true)], stop: true },
  { test: /\b(mexerica|tangerina|bergamota|pocan|poncã)/, measures: [m("unidade", 120, true)], stop: true },
  { test: /\blimao,/, measures: [m("unidade", 65, true)], stop: true },
  { test: /\bmamao, ?(papaia|papaya)/, measures: [m("unidade", 300, true), m("fatia", 150)], stop: true },
  { test: /\bmamao,/, measures: [m("fatia", 170, true)], stop: true },
  { test: /^manga,/, measures: [m("unidade", 300, true)], stop: true },
  { test: /\bkiwi/, measures: [m("unidade", 75, true)], stop: true },
  { test: /\bmorango/, measures: [m("unidade", 12, true), m("xícara", 150)], stop: true },
  { test: /\buva,/, measures: [m("unidade", 5, true), m("cacho pequeno", 100)], stop: true },
  { test: /\babacate/, measures: [m("unidade", 400, true), m("colher de sopa", 40)], stop: true },
  { test: /\b(melancia|melao),/, measures: [m("fatia", 200, true)], stop: true },
  { test: /\babacaxi,/, measures: [m("fatia", 75, true)], stop: true },
  { test: /\bgoiaba,/, measures: [m("unidade", 130, true)], stop: true },
  { test: /\bcaqui/, measures: [m("unidade", 100, true)], stop: true },
  { test: /\bpessego,/, measures: [m("unidade", 70, true)], stop: true },
  { test: /\bameixa,/, measures: [m("unidade", 35, true)], stop: true },
  { test: /\bfigo,/, measures: [m("unidade", 50, true)], stop: true },
  { test: /\bacerola/, measures: [m("unidade", 5, true)], stop: true },

  // --- Vegetables & tubers ------------------------------------------------
  { test: /\btomate,/, measures: [m("unidade", 90, true), m("fatia", 20)], stop: true },
  { test: /\bcenoura,/, measures: [m("unidade", 90, true), m("colher de sopa", 20)], stop: true },
  { test: /\bbatata, ?(doce)/, measures: [m("unidade", 130, true), m("colher de sopa", 45)], stop: true },
  { test: /\bbatata, ?(inglesa|monalisa)?/, measures: [m("unidade", 100, true), m("colher de sopa", 45)], stop: true },
  { test: /\bmandioca|aipim|macaxeira/, measures: [m("pedaço", 100, true)], stop: true },
  { test: /\b(cebola),/, measures: [m("unidade", 110, true), m("colher de sopa", 15)], stop: true },
  { test: /\balho,/, measures: [m("dente", 3, true)], stop: true },
  { test: /\bpepino,/, measures: [m("unidade", 130, true)], stop: true },
  { test: /\babobrinha|abobora|moranga/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\bbrocolis|couve-flor|couve flor/, measures: [m("colher de sopa", 20, true), m("xícara", 70)], stop: true },
  { test: /\balface|rucula|agriao|espinafre|acelga|couve,/, measures: [m("folha", 10, true), m("xícara", 25)], stop: true },
  { test: /\bbeterraba,/, measures: [m("unidade", 90, true), m("colher de sopa", 20)], stop: true },
  { test: /\bchuchu|berinjela|vagem|quiabo|jilo/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\bmilho, ?verde/, measures: [m("espiga", 130, true), m("colher de sopa", 20)], stop: true },
  { test: /\bpimentao/, measures: [m("unidade", 120, true)], stop: true },

  // --- Grains, legumes, pasta --------------------------------------------
  { test: /\barroz,.*(cozid)/, measures: [m("colher de sopa", 25, true), m("escumadeira", 45)], stop: true },
  { test: /\b(feijao|feijão),.*(cozid)/, measures: [m("concha", 80, true), m("colher de sopa", 20)], stop: true },
  { test: /\b(lentilha|grao-de-bico|grão-de-bico|ervilha),.*(cozid)/, measures: [m("colher de sopa", 25, true), m("concha", 70)], stop: true },
  { test: /\b(macarrao|massa|talharim|espaguete|penne),.*(cozid)/, measures: [m("escumadeira", 60, true), m("pegador", 90)], stop: true },
  { test: /\bpurê|pure de batata/, measures: [m("colher de sopa", 40, true)], stop: true },
  { test: /\bfarofa|farinha,.*(mandioca|torrada)/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bfarinha,/, measures: [m("colher de sopa", 15, true), m("xícara", 120)], stop: true },
  { test: /\b(aveia|farelo de aveia|farinha de aveia)/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bgranola|musli|muesli/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bcereal matinal|sucrilhos|flocos de milho|corn flakes/, measures: [m("xícara", 30, true), m("colher de sopa", 12)], stop: true },
  { test: /\btapioca/, measures: [m("unidade", 90, true), m("colher de sopa", 15)], stop: true },
  { test: /\bcuscuz/, measures: [m("fatia", 80, true)], stop: true },
  { test: /\bquinoa|amaranto/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\bpolenta|angu/, measures: [m("colher de sopa", 40, true)], stop: true },

  // --- Dairy --------------------------------------------------------------
  // Specific milk products before the generic "leite," (which would else win).
  { test: /\bleite,? ?condensado/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\bleite,.*(po|pó)/, measures: [m("colher de sopa", 12, true)], stop: true },
  { test: /\bleite,? ?(de )?coco/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bleite,/, measures: [m("copo", 200, true), m("xícara", 240)], stop: true },
  { test: /\biogurte,/, measures: [m("pote", 170, true), m("colher de sopa", 20)], stop: true },
  { test: /\bqueijo,.*(parmesao|ralado)/, measures: [m("colher de sopa", 10, true)], stop: true },
  { test: /\bqueijo,.*(cottage|ricota|requeijao)/, measures: [m("colher de sopa", 30, true)], stop: true },
  { test: /\bqueijo,/, measures: [m("fatia", 20, true)], stop: true },
  { test: /\brequeijao/, measures: [m("colher de sopa", 30, true)], stop: true },
  { test: /\bcreme de leite/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bleite condensado/, measures: [m("colher de sopa", 20, true)], stop: true },

  // --- Savory snacks (before meats, which would match "carne") ------------
  { test: /\b(pastel|coxinha|empada|esfiha|esfirra|kibe|quibe|risole|croquete|bolinho),/, measures: [m("unidade", 50, true)], stop: true },
  { test: /\b(nugget|empanado)/, measures: [m("unidade", 20, true)], stop: true },

  // --- Meats, fish, cold cuts --------------------------------------------
  { test: /\bfrango, ?peito/, measures: [m("filé", 100, true)], stop: true },
  { test: /\bfrango, ?(coxa|sobrecoxa)/, measures: [m("unidade", 65, true)], stop: true },
  { test: /\b(carne|bovina|patinho|alcatra|coxao|contra-file|contrafile|acem|file mignon),/, measures: [m("bife", 100, true)], stop: true },
  { test: /\bhamburguer/, measures: [m("unidade", 56, true)], stop: true },
  { test: /\balmondega|almôndega/, measures: [m("unidade", 30, true)], stop: true },
  { test: /\bsalsicha/, measures: [m("unidade", 50, true)], stop: true },
  { test: /\blinguica|linguiça/, measures: [m("gomo", 60, true)], stop: true },
  { test: /\b(presunto|peito de peru|mortadela|blanquet|apresuntado)/, measures: [m("fatia", 15, true)], stop: true },
  { test: /\bbacon/, measures: [m("fatia", 10, true)], stop: true },
  { test: /\bsardinha/, measures: [m("unidade", 25, true)], stop: true },
  { test: /\batum/, measures: [m("colher de sopa", 20, true), m("lata", 120)], stop: true },
  { test: /\b(peixe|tilapia|merluza|salmao|pescada|cacao|corvina),/, measures: [m("filé", 100, true)], stop: true },
  { test: /\bcamarao/, measures: [m("unidade", 10, true)], stop: true },

  // --- Nuts, seeds, spreads ----------------------------------------------
  { test: /\bamendoim/, measures: [m("colher de sopa", 12, true), m("punhado", 30)], stop: true },
  { test: /\bpasta de amendoim/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\bcastanha( |-)?(do para|do pará|de caju)?/, measures: [m("unidade", 5, true), m("punhado", 25)], stop: true },
  { test: /\bnozes?|amendoas?|amêndoas?|avela/, measures: [m("unidade", 4, true), m("punhado", 25)], stop: true },
  { test: /\b(chia|linhaca|linhaça|gergelim|girassol|abobora, ?semente)/, measures: [m("colher de sopa", 12, true)], stop: true },
  { test: /\bcoco,.*(ralado|flocos)/, measures: [m("colher de sopa", 10, true)], stop: true },
  { test: /\bazeitona/, measures: [m("unidade", 4, true)], stop: true },

  // --- Oils, fats, sugars, condiments ------------------------------------
  { test: /\b(oleo|óleo|azeite),/, measures: [m("colher de sopa", 8, true), m("colher de chá", 3)], stop: true },
  { test: /\b(manteiga|margarina),/, measures: [m("colher de sopa", 15, true), m("ponta de faca", 5)], stop: true },
  { test: /^acucar/, measures: [m("colher de sopa", 12, true), m("colher de chá", 4)], stop: true },
  { test: /\bmel,/, measures: [m("colher de sopa", 20, true), m("colher de chá", 7)], stop: true },
  { test: /\b(geleia|geléia|doce de)/, measures: [m("colher de sopa", 20, true)], stop: true },
  { test: /\b(maionese|ketchup|catchup|mostarda|molho de tomate|molho shoyu|shoyu)/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bsal,/, measures: [m("colher de chá", 5, true)], stop: true },
  { test: /\bachocolatado|chocolate,.*(po|pó)|cacau,.*(po|pó)|nescau|toddy/, measures: [m("colher de sopa", 15, true)], stop: true },
  { test: /\bchocolate,/, measures: [m("barra", 25, true), m("quadradinho", 6)], stop: true },

  // --- Powders / supplements ---------------------------------------------
  { test: /\b(whey|proteina|proteína).*\((po|pó)\)|whey protein/, measures: [m("scoop", 30, true), m("colher de sopa", 15)], stop: true },
  { test: /\bproteina texturizada|pts/, measures: [m("colher de sopa", 10, true)], stop: true },

  // --- Beverages ----------------------------------------------------------
  { test: /\bsuco,/, measures: [m("copo", 200, true)], stop: true },
  { test: /\brefrigerante/, measures: [m("copo", 200, true), m("lata", 350)], stop: true },
  { test: /\bcafe,.*(infusao|infusão|coado)/, measures: [m("xícara", 50, true)], stop: true },
  { test: /\b(cha|chá),.*(infusao|infusão)/, measures: [m("xícara", 200, true)], stop: true },
  { test: /\bagua de coco/, measures: [m("copo", 200, true)], stop: true },
  { test: /\bbebida de aveia|bebida vegetal/, measures: [m("copo", 200, true)], stop: true },
];

function measuresFor(description) {
  const d = norm(description);
  const out = [];
  const seen = new Set();
  for (const rule of RULES) {
    if (!rule.test.test(d)) continue;
    for (const meas of rule.measures) {
      if (seen.has(meas.label)) continue;
      seen.add(meas.label);
      out.push(meas);
    }
    if (rule.stop) break;
  }
  // Exactly one default: the first that asked for it, else the first measure.
  let hasDefault = false;
  for (const meas of out) {
    if (meas.default && !hasDefault) hasDefault = true;
    else meas.default = false;
  }
  if (!hasDefault && out.length) out[0].default = true;
  return out;
}

// Gather every base food description (TACO CSV + supplement).
const csvRows = parseCsv(readFileSync(CSV, "utf8"));
const descriptions = csvRows.slice(1).map((r) => r[1]).filter(Boolean);
try {
  const sup = JSON.parse(readFileSync(SUPPLEMENT, "utf8"));
  for (const f of sup.foods ?? []) descriptions.push(f.description);
} catch {
  /* no supplement — fine */
}

const measures = [];
let matched = 0;
for (const description of descriptions) {
  const ms = measuresFor(description);
  if (ms.length === 0) continue;
  matched++;
  for (const meas of ms) {
    measures.push({
      food: description,
      label: meas.label,
      grams: meas.grams,
      isDefault: meas.default,
    });
  }
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note:
        "Generated by scripts/build-food-measures.mjs. Curated household measures (medidas caseiras) for common base foods — grams are approximate Brazilian references; coaches/admin can add or override per food. Matched to the catalog by exact description; seeded as base rows (clinic_id NULL) by scripts/migrate.mjs.",
      measures,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `✓ Wrote ${measures.length} measures for ${matched} foods (of ${descriptions.length}) → ${OUT}`,
);
