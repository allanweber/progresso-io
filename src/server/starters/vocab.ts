/**
 * Starter catalog vocabulary. The starter diets/workouts (in
 * `drizzle/data/diets/*.json` and `drizzle/data/workouts/*.json`) can't embed
 * catalog UUIDs — a `food`/`exercise` id is generated per database, so a starter
 * authored against one seed would dangle in another. Instead a starter references
 * a catalog item by a **stable slug** (e.g. `"frango"`, `"supino_barra"`), and
 * each slug maps here to a case-insensitive regex matched against the **base**
 * catalog's description/name at seed/import time (`resolveFoodSlugs` /
 * `resolveExerciseSlugs`). The shortest matching row wins — the same
 * "shortest description" rule the dev seed uses — so a slug resolves to the
 * plainest food/exercise of its kind.
 *
 * These slugs are the ONLY vocabulary a starter may reference; the resolution
 * guard test asserts every slug used by every starter resolves against the real
 * seeded base catalog, so a typo or a catalog change is caught in CI, not in a
 * silently-broken clinic.
 */

/** slug → regex (source) matched against `food.description` (base foods only). */
export const FOOD_VOCAB = {
  // Carbohydrates
  arroz_branco: "arroz.*tipo 1.*cozido",
  arroz_integral: "arroz.*integral.*cozido",
  batata_doce: "batata.*doce.*cozida",
  batata_ingl: "batata.*inglesa.*cozida",
  mandioca: "^mandioca, cozida",
  aveia: "aveia.*flocos.*crua",
  pao_frances: "pão.*trigo.*francês",
  pao_integral: "pão.*trigo.*forma.*integral",
  macarrao: "^macarrão, trigo, cru$",
  tapioca: "^tapioca",
  // Proteins (animal)
  frango: "frango.*peito.*sem pele.*grelhad",
  ovo: "ovo.*galinha.*inteiro.*cozido",
  clara_ovo: "ovo.*galinha.*clara.*cozida",
  patinho: "patinho.*sem gordura.*cru",
  merluza: "merluza.*filé.*assado",
  salmao: "salmão.*sem pele.*fresco.*grelhad",
  // Proteins (plant) + supplements
  feijao: "feijão.*carioca.*cozido",
  lentilha: "lentilha.*cozida",
  grao_bico: "grão-de-bico.*cru",
  tofu: "soja.*queijo.*tofu",
  pts_soja: "proteína texturizada",
  whey: "whey protein concentrate",
  whey_iso: "whey protein isolado",
  prot_ervilha: "proteína de ervilha",
  // Dairy
  leite_int: "leite.*vaca.*integral",
  leite_desn: "leite.*vaca.*desnatado.*uht",
  iogurte: "iogurte.*natural.*desnatado",
  queijo_minas: "^queijo, minas",
  queijo_moz: "queijo.*mozarela",
  // Fats
  azeite: "azeite.*oliva",
  castanha: "castanha-do-brasil.*crua",
  pasta_amendoim: "amendoim.*grão.*cru",
  abacate: "^abacate, cru",
  // Fruits
  banana: "banana.*prata.*crua",
  maca: "maçã.*fuji",
  mamao: "mamão.*papaia.*cru",
  laranja: "laranja.*pêra.*crua",
  // Vegetables
  tomate: "tomate.*com semente.*cru",
  cenoura: "^cenoura, cozida",
  brocolis: "^brócolis, cozido",
  alface: "alface.*crespa",
  couve: "couve.*manteiga.*refogada",
} as const;

export type FoodSlug = keyof typeof FOOD_VOCAB;

export const EXERCISE_VOCAB = {
  supino_barra: "0025",
  supino_halt: "0289",
  supino_incl: "0047",
  supino_maq: "0577",
  crucifixo: "0308",
  crucifixo_halt: "0319",
  butterfly: "0596",
  flexao: "0662",
  mergulho: "0129",
  puxada_frontal: "0198",
  remada_curvada: "0027",
  remada_baixa: "0861",
  remada_uni: "0292",
  barra_fixa: "0652",
  agachamento_livre: "0043",
  agachamento_smith: "0770",
  agachamento_corp: "1197",
  agach_sumo: "1760",
  leg_press: "0739",
  extensora: "0585",
  flexora: "0599",
  terra: "0085",
  stiff: "0116",
  afundo: "0336",
  panturrilha_pe: "0605",
  elev_pelvica: "1409",
  coice_gluteo: "4421",
  abdutora: "0597",
  adutora: "0598",
  desenv_barra: "1162",
  desenv_halt: "0405",
  arnold: "2137",
  elev_lateral: "0334",
  elev_frontal: "0162",
  crucifixo_inv: "0378",
  face_pull: "0203",
  encolhimento: "0095",
  rosca_direta: "0031",
  rosca_alt: "0285",
  rosca_martelo: "0313",
  rosca_scott: "0070",
  triceps_testa: "5873",
  triceps_pulley: "0201",
  triceps_corda: "0200",
  prancha: "0463",
  abdominal: "0274",
  escalador: "0630",
  polichinelo: "3094",
} as const;

export type ExerciseSlug = keyof typeof EXERCISE_VOCAB;
