import {
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
  countQuestions,
} from "@/lib/anamneses";
import { LEVEL_LABELS } from "@/lib/exercises";
import type { StarterCatalogDto, StarterItemDto } from "@/lib/starters";
import { STARTER_ANAMNESES } from "@/server/anamneses/starter-templates";
import { STARTER_DIETS } from "@/server/diets/starter-templates";
import { STARTER_WORKOUTS } from "@/server/workouts/starter-templates";

/**
 * Flattens the 30 starter templates into the summary the setup guide lists.
 *
 * Built once at module scope: the starters are static JSON compiled into the
 * server bundle, so recomputing this per request would be pure waste — and the
 * guide's GET is the first request a brand-new coach makes, which is the one
 * request worth being quick.
 *
 * The order of each array is the curated order the starter modules declare (most
 * broadly useful first), not alphabetical — a coach scanning the list should
 * meet "Emagrecimento" and "Full body iniciante" before the specialisations.
 */

/** "Iniciante", "Intermediário", "Avançado" — reused from the exercise catalog. */
function levelLabel(level: string): string {
  return LEVEL_LABELS[level as keyof typeof LEVEL_LABELS] ?? level;
}

/** `n` with its PT-BR noun, singular or plural. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const DIETS: StarterItemDto[] = STARTER_DIETS.map((d) => ({
  key: d.key,
  name: d.name,
  description: d.notes ?? "",
  hint: [
    count(d.meals.length, "refeição", "refeições"),
    count(
      d.meals.reduce((n, m) => n + m.items.length, 0),
      "alimento",
      "alimentos",
    ),
  ].join(" · "),
}));

const WORKOUTS: StarterItemDto[] = STARTER_WORKOUTS.map((w) => ({
  key: w.key,
  name: w.name,
  description: w.notes ?? "",
  hint: [
    levelLabel(w.level),
    count(w.sessions.length, "sessão", "sessões"),
    count(
      w.sessions.reduce((n, s) => n + s.exercises.length, 0),
      "exercício",
      "exercícios",
    ),
  ].join(" · "),
}));

const ANAMNESES: StarterItemDto[] = STARTER_ANAMNESES.map((a) => ({
  key: a.key,
  name: a.name,
  description: a.description,
  hint: [
    ANAMNESIS_OBJECTIVE_LABELS[a.objective],
    ANAMNESIS_MODALITY_LABELS[a.modality],
    count(countQuestions(a.sections), "pergunta", "perguntas"),
  ].join(" · "),
}));

/** The catalog the setup guide renders. Frozen — it is shared by every request. */
export const STARTER_CATALOG: StarterCatalogDto = Object.freeze({
  diets: DIETS,
  workouts: WORKOUTS,
  anamneses: ANAMNESES,
});

/** Every valid key, per domain — the allow-list a posted selection is filtered to. */
export const STARTER_KEYS = Object.freeze({
  diets: DIETS.map((d) => d.key),
  workouts: WORKOUTS.map((w) => w.key),
  anamneses: ANAMNESES.map((a) => a.key),
});
