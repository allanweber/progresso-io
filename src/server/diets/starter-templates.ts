import type { FoodSlug } from "@/server/starters/vocab";

import cetogenica from "../../../drizzle/data/diets/cetogenica.json";
import diabeticoMetabolica from "../../../drizzle/data/diets/diabetico-metabolica.json";
import economica from "../../../drizzle/data/diets/economica.json";
import emagrecimento from "../../../drizzle/data/diets/emagrecimento.json";
import ganhoDePeso from "../../../drizzle/data/diets/ganho-de-peso.json";
import hipertrofia from "../../../drizzle/data/diets/hipertrofia.json";
import jejumIntermitente from "../../../drizzle/data/diets/jejum-intermitente.json";
import lowCarb from "../../../drizzle/data/diets/low-carb.json";
import manutencao from "../../../drizzle/data/diets/manutencao.json";
import recomposicao from "../../../drizzle/data/diets/recomposicao.json";
import reeducacaoAlimentar from "../../../drizzle/data/diets/reeducacao-alimentar.json";
import vegana from "../../../drizzle/data/diets/vegana.json";
import vegetariana from "../../../drizzle/data/diets/vegetariana.json";

/**
 * The curated starter set of diet templates. Each `drizzle/data/diets/*.json`
 * file is the single source of truth for one starter, referencing base TACO
 * foods by the stable slugs in `@/server/starters/vocab` (a `food` UUID differs
 * per database, so it can't be embedded). When a clinic is seeded it receives a
 * clinic-owned **copy** of each (see `seedClinicDiets`), which the clinic then
 * owns and edits freely. Editing a JSON here only affects clinics seeded
 * afterwards.
 */
export type StarterDietSubstitute = { food: FoodSlug; grams: number };

export type StarterDietItem = {
  food: FoodSlug;
  grams: number;
  /** Optional household-measure snapshot (e.g. "unidade" = 50 g). */
  measure?: { label: string; grams: number };
  substitutes?: StarterDietSubstitute[];
};

export type StarterDietMeal = {
  name: string;
  time: string | null;
  items: StarterDietItem[];
};

export type StarterDiet = {
  key: string;
  name: string;
  /** Informational objective tag (not a stored column — the diet has none). */
  objective: string;
  notes: string | null;
  meals: StarterDietMeal[];
};

export const STARTER_DIETS: StarterDiet[] = [
  emagrecimento,
  hipertrofia,
  manutencao,
  lowCarb,
  cetogenica,
  reeducacaoAlimentar,
  vegetariana,
  recomposicao,
  economica,
  vegana,
  diabeticoMetabolica,
  ganhoDePeso,
  jejumIntermitente,
] as unknown as StarterDiet[];
