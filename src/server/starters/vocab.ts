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

/** slug → regex (source) matched against `exercise.name` (base exercises only). */
export const EXERCISE_VOCAB = {
  // Chest
  supino_barra: "supino reto|supino com barra",
  supino_halt: "supino.*halteres",
  supino_incl: "supino inclinado",
  supino_maq: "supino máquina",
  crucifixo: "^crucifixo$",
  crucifixo_halt: "crucifixo com halteres",
  butterfly: "^butterfly$",
  flexao: "^flexões$",
  mergulho: "mergulho no banco",
  // Back
  puxada_frontal: "puxada frontal|puxada aberta|pulldown",
  remada_curvada: "remada curvada",
  remada_baixa: "remada baixa|remada sentad",
  remada_uni: "remada unilateral com halter",
  barra_fixa: "^barra fixa$",
  // Legs
  agachamento_livre: "agachamento livre",
  agachamento_smith: "agachamento no smith",
  agachamento_corp: "agachamento corporal",
  agach_sumo: "agachamento sumô",
  leg_press: "^leg press$",
  extensora: "extensão de perna",
  flexora: "^cadeira flexora$",
  terra: "levantamento terra romeno",
  stiff: "stiff",
  afundo: "afundo com halteres",
  panturrilha_pe: "elevação de panturrilha em pé",
  elev_pelvica: "elevação pélvica com barra",
  coice_gluteo: "coice de glúteo",
  abdutora: "abdutor de coxas",
  adutora: "adutor de coxas",
  // Shoulders
  desenv_barra: "desenvolvimento militar com barra",
  desenv_halt: "desenvolvimento com halteres",
  arnold: "press arnold com halteres",
  elev_lateral: "^elevação lateral$",
  elev_frontal: "elevação frontal",
  crucifixo_inv: "^crucifixo inverso$",
  face_pull: "^face pull$",
  encolhimento: "encolhimento de ombros com barra",
  // Arms
  rosca_direta: "rosca direta|rosca com barra",
  rosca_alt: "rosca alternada",
  rosca_martelo: "^rosca martelo$",
  rosca_scott: "^rosca scott$",
  triceps_testa: "tríceps testa|tríceps francês deitado",
  triceps_pulley: "^tríceps pulley$",
  triceps_corda: "tríceps corda|tríceps na corda",
  // Core / conditioning
  prancha: "^prancha$",
  abdominal: "^abdominal$",
  escalador: "^escalador$",
  polichinelo: "polichinelo",
} as const;

export type ExerciseSlug = keyof typeof EXERCISE_VOCAB;
