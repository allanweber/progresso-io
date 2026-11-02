/**
 * Advanced training techniques (técnicas avançadas) — a **static** app catalog,
 * not tenant data. A workout exercise item only stores the technique's *key*
 * (an enum); the label, color
 * and PT-BR **explanation** the aluno reads all live here, keyed by that enum.
 * The drawn mark lives in `components/workouts/technique-icon.tsx` — this
 * module is imported by the schema and the DAL and stays free of React. Nothing technique-related is ever frozen onto a workout version, so we
 * can refine an explanation and every athlete sees it immediately.
 *
 * A técnica is an intensity tag on one exercise (drop set, rest-pause, cluster,
 * GVT, FS7…). A super set is a `groupId` block, not a técnica.
 *
 * This module is client-safe (no server/database import) so it bundles into the
 * builder and the aluno portal alike.
 */

export const WORKOUT_TECHNIQUES = [
  "dropset",
  "tripledrop",
  "gvt",
  "fs7",
  "restpause",
  "cluster",
] as const;

export type WorkoutTechnique = (typeof WORKOUT_TECHNIQUES)[number];

export type TechniqueMark = WorkoutTechnique | "superset";

export type WorkoutTechniqueInfo = {
  /** Short PT-BR label shown on the badge (e.g. "Drop set"). */
  label: string;
  /** Badge foreground / background colors (hex). */
  color: string;
  bg: string;
  /** The PT-BR explanation the aluno reads in the exercise detail. */
  description: string;
};

export const WORKOUT_TECHNIQUE_CATALOG: Record<
  TechniqueMark,
  WorkoutTechniqueInfo
> = {
  dropset: {
    label: "Drop set",
    color: "#DC2626",
    bg: "#FEE2E2",
    description:
      "Faça a série até a falha, reduza a carga em ~20-30% e continue sem descanso até falhar de novo. Uma redução de carga.",
  },
  tripledrop: {
    label: "Triple drop set",
    color: "#B91C1C",
    bg: "#FEE2E2",
    description:
      "Como o drop set, mas com 3 reduções de carga seguidas, sem descanso — leve o músculo à falha em cada etapa.",
  },
  superset: {
    label: "Super set",
    color: "#059669",
    bg: "#DCFCE7",
    description:
      "Dois ou mais exercícios executados em sequência, sem descanso entre eles. Descanse apenas ao final do bloco.",
  },
  gvt: {
    label: "GVT 10×10",
    color: "#1D4ED8",
    bg: "#DBEAFE",
    description:
      "German Volume Training: 10 séries de 10 repetições com a mesma carga (~60% de 1RM) e descanso curto. Alto volume.",
  },
  fs7: {
    label: "FS7",
    color: "#C026D3",
    bg: "#FAE8FF",
    description:
      "Fascia Stretch 7: 7 séries do mesmo exercício com descanso curto (~30s) entre elas, buscando congestão máxima e alongamento da fáscia.",
  },
  restpause: {
    label: "Rest-pause",
    color: "#EA580C",
    bg: "#FFEDD5",
    description:
      "Leve a série à falha, descanse 10-15s e faça mais algumas reps com a mesma carga. Repita 1-2 vezes.",
  },
  cluster: {
    label: "Cluster",
    color: "#7C3AED",
    bg: "#EDE9FE",
    description:
      "Divida a série em mini-blocos (ex: 3 blocos de 5 reps) com pausas curtas de 10-20s entre eles, mantendo a carga alta.",
  },
};

/** Options for the builder's technique select (value + PT-BR label). */
export const WORKOUT_TECHNIQUE_OPTIONS: {
  value: WorkoutTechnique;
  label: string;
}[] = WORKOUT_TECHNIQUES.map((value) => ({
  value,
  label: WORKOUT_TECHNIQUE_CATALOG[value].label,
}));

/** The catalog entry for a mark, or null (no technique). */
export function techniqueInfo(
  technique: TechniqueMark | null | undefined,
): WorkoutTechniqueInfo | null {
  return technique ? WORKOUT_TECHNIQUE_CATALOG[technique] : null;
}
