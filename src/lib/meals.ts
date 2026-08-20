/**
 * The canonical meal slots — **one list**, shared by the diet builder's
 * suggestion chips and the AI generator's meal picker.
 *
 * They were two lists that had already drifted: the builder offered
 * "Pré-treino" and the generator did not, so a coach could build a plan by hand
 * that the AI was structurally unable to reproduce. Anything that adds a meal
 * belongs here and nowhere else.
 *
 * The slot is more than a label. Each one carries a **kind**, which is what
 * lets the diet prompt refuse arroz-e-feijão at breakfast, and an indicative
 * **time**, which anchors the plan to a clock.
 */

export const MEAL_SLOT_VALUES = [
  "cafe_da_manha",
  "lanche_manha",
  "almoco",
  "lanche_tarde",
  "pre_treino",
  "pos_treino",
  "jantar",
  "ceia",
] as const;
export type MealSlot = (typeof MEAL_SLOT_VALUES)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  cafe_da_manha: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  pre_treino: "Pré-treino",
  pos_treino: "Pós-treino",
  jantar: "Jantar",
  ceia: "Ceia",
};

/**
 * Indicative clock time, so a generated plan is anchored rather than floating.
 *
 * The training slots are the honest exception: they are relative to a session
 * whose time we do not know, so the afternoon default is a guess the coach is
 * expected to move. Listing them in the late-afternoon position is the same
 * guess — afternoon training is the common case, not the only one.
 */
export const MEAL_SLOT_TIMES: Record<MealSlot, string> = {
  cafe_da_manha: "07:00",
  lanche_manha: "10:00",
  almoco: "12:30",
  lanche_tarde: "16:00",
  pre_treino: "17:00",
  pos_treino: "19:00",
  jantar: "20:00",
  ceia: "22:00",
};

/**
 * What kind of food belongs in each slot. This is the whole reason the picker
 * asks *which* meals rather than *how many* — a count tells the model nothing,
 * a kind tells it that 7h is not the hour for arroz e feijão.
 *
 * The two training slots are the ones a generic "refeição" would get most
 * wrong, and the ones a coach most wants right: they are about timing around
 * effort, not about the time of day.
 */
export const MEAL_SLOT_KINDS: Record<MealSlot, string> = {
  cafe_da_manha:
    "alimentos de café da manhã — pães, tapioca, ovos, frutas, aveia, laticínios, café",
  lanche_manha: "lanche leve — fruta, iogurte, castanhas, sanduíche simples",
  almoco:
    "refeição completa — arroz, feijão, tubérculos ou massa, uma proteína e salada/legumes",
  lanche_tarde: "lanche leve — fruta, iogurte, castanhas, sanduíche simples",
  pre_treino:
    "carboidrato de digestão rápida com pouca gordura e pouca fibra, porção pequena — o objetivo é energia sem peso no estômago",
  pos_treino:
    "proteína + carboidrato para recuperação, baixa gordura — nunca uma refeição pesada",
  jantar:
    "refeição completa, geralmente mais leve que o almoço — proteína, vegetais e um carboidrato",
  ceia: "leve — laticínios, castanhas ou fruta. Nunca uma refeição completa",
};

/**
 * What the AI dialog opens with: the everyday five.
 *
 * Pré and pós-treino are deliberately **out** of the default. They only make
 * sense next to a training session, and generating them unasked would hand
 * every sedentary aluno two meals they do not need — the coach ticks them when
 * the aluno actually trains.
 */
export const DEFAULT_AI_MEALS: MealSlot[] = [
  "cafe_da_manha",
  "lanche_manha",
  "almoco",
  "lanche_tarde",
  "jantar",
];
