/**
 * Client-safe starter-catalog contract: what the setup guide's "Modelos" step
 * renders, and the selection it posts back.
 *
 * The starter templates themselves are 30 JSON documents (every meal, every set,
 * every question) imported by each domain's `starter-templates` module. Those
 * must never
 * reach the browser — the guide only needs a name, a line of description and a
 * shape hint per template, so the server flattens them to {@link StarterItemDto}
 * and serves that. See `@/server/starters/catalog`.
 */

/** One selectable starter template, as the guide lists it. */
export type StarterItemDto = {
  /** Stable `source_key` — what a selection is expressed in. */
  key: string;
  name: string;
  /** One line on what it is for. May be empty for a starter with no notes. */
  description: string;
  /** The shape, at a glance: "5 refeições · 21 itens", "Intermediário · 3 sessões". */
  hint: string;
};

/** The three selectable domains, each already sorted the way it is presented. */
export type StarterCatalogDto = {
  diets: StarterItemDto[];
  workouts: StarterItemDto[];
  anamneses: StarterItemDto[];
};

/** The `source_key`s a clinic already holds — rendered ticked and disabled. */
export type StarterOwnedKeys = {
  diets: string[];
  workouts: string[];
  anamneses: string[];
};

/**
 * A coach's picks, posted when the Modelos step is committed. An omitted domain
 * means "all of it" (what skipping the guide sends); an empty array means the
 * coach unticked everything in that domain, which is a real choice and not the
 * same thing.
 */
export type StarterSelectionInput = {
  diets?: string[];
  workouts?: string[];
  anamneses?: string[];
};

/** Total templates on offer — the "Selecionar todos" counter. */
export function countStarters(catalog: StarterCatalogDto): number {
  return (
    catalog.diets.length + catalog.workouts.length + catalog.anamneses.length
  );
}
