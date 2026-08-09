import type {
  AnamnesisModality,
  AnamnesisObjective,
  AnamnesisSection,
} from "@/lib/anamneses";

import clinicaMetabolica from "../../../drizzle/data/anamneses/clinica-metabolica.json";
import emagrecimentoOnline from "../../../drizzle/data/anamneses/emagrecimento-online.json";
import emagrecimentoPresencial from "../../../drizzle/data/anamneses/emagrecimento-presencial.json";
import hipertrofia from "../../../drizzle/data/anamneses/hipertrofia.json";
import reeducacaoSaude from "../../../drizzle/data/anamneses/reeducacao-saude.json";
import saudeDaMulher from "../../../drizzle/data/anamneses/saude-da-mulher.json";

/**
 * The curated starter set of anamneses (anamnese templates). These are the
 * `drizzle/data/anamneses/*.json` files — the single source of truth — imported
 * so they bundle into the server. When a clinic is created it receives a **copy**
 * of each (see `seedClinicAnamneses` in the DAL); the clinic then owns and edits
 * them freely. Editing a JSON here only affects clinics created afterwards.
 */
export type StarterAnamnesis = {
  key: string;
  name: string;
  description: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: AnamnesisSection[];
};

export const STARTER_ANAMNESES: StarterAnamnesis[] = [
  emagrecimentoPresencial,
  emagrecimentoOnline,
  hipertrofia,
  reeducacaoSaude,
  clinicaMetabolica,
  saudeDaMulher,
] as unknown as StarterAnamnesis[];
