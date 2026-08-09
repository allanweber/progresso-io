/**
 * Advanced training techniques (técnicas avançadas) — a **static** app catalog,
 * not tenant data. A workout exercise item only stores the technique's *key*
 * (an enum) and, for grouping techniques, a shared `groupId`; the label, color,
 * icon and PT-BR **explanation** the aluno reads all live here, keyed by that
 * enum. Nothing technique-related is ever frozen onto a workout version, so we
 * can refine an explanation and every athlete sees it immediately.
 *
 * Two kinds:
 * - single-exercise intensity techniques (drop set, rest-pause, cluster, GVT,
 *   FS7…) — just a tag on one exercise;
 * - grouping techniques (`grouping: true`: super set, giant set) — consecutive
 *   items sharing a `groupId` form one block executed without rest between them.
 *
 * This module is client-safe (no server/database import) so it bundles into the
 * builder and the aluno portal alike.
 */

export const WORKOUT_TECHNIQUES = [
  "dropset",
  "tripledrop",
  "superset",
  "giant",
  "gvt",
  "fs7",
  "restpause",
  "cluster",
] as const;

export type WorkoutTechnique = (typeof WORKOUT_TECHNIQUES)[number];

export type WorkoutTechniqueInfo = {
  /** Short PT-BR label shown on the badge (e.g. "Drop set"). */
  label: string;
  /** Badge foreground / background colors (hex). */
  color: string;
  bg: string;
  /** A single emoji marker. */
  icon: string;
  /**
   * Whether this technique **groups** consecutive exercises into one block run
   * without rest between them (super set / giant set). The builder only creates
   * a `groupId` for grouping techniques.
   */
  grouping: boolean;
  /** The PT-BR explanation the aluno reads in the exercise detail. */
  description: string;
};

export const WORKOUT_TECHNIQUE_CATALOG: Record<
  WorkoutTechnique,
  WorkoutTechniqueInfo
> = {
  dropset: {
    label: "Drop set",
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: "📉",
    grouping: false,
    description:
      "Faça a série até a falha, reduza a carga em ~20-30% e continue sem descanso até falhar de novo. Uma redução de carga.",
  },
  tripledrop: {
    label: "Triple drop set",
    color: "#B91C1C",
    bg: "#FEE2E2",
    icon: "📉",
    grouping: false,
    description:
      "Como o drop set, mas com 3 reduções de carga seguidas, sem descanso — leve o músculo à falha em cada etapa.",
  },
  superset: {
    label: "Super set",
    color: "#059669",
    bg: "#DCFCE7",
    icon: "🔗",
    grouping: true,
    description:
      "Dois exercícios executados em sequência, sem descanso entre eles. Descanse apenas ao final do par.",
  },
  giant: {
    label: "Giant set",
    color: "#0D9488",
    bg: "#CCFBF1",
    icon: "⛓️",
    grouping: true,
    description:
      "Três ou mais exercícios em sequência, sem descanso entre eles. Alta densidade e intensidade metabólica.",
  },
  gvt: {
    label: "GVT 10×10",
    color: "#1D4ED8",
    bg: "#DBEAFE",
    icon: "🔟",
    grouping: false,
    description:
      "German Volume Training: 10 séries de 10 repetições com a mesma carga (~60% de 1RM) e descanso curto. Alto volume.",
  },
  fs7: {
    label: "FS7",
    color: "#C026D3",
    bg: "#FAE8FF",
    icon: "🌸",
    grouping: false,
    description:
      "Fascia Stretch 7: 7 séries do mesmo exercício com descanso curto (~30s) entre elas, buscando congestão máxima e alongamento da fáscia.",
  },
  restpause: {
    label: "Rest-pause",
    color: "#EA580C",
    bg: "#FFEDD5",
    icon: "⏸️",
    grouping: false,
    description:
      "Leve a série à falha, descanse 10-15s e faça mais algumas reps com a mesma carga. Repita 1-2 vezes.",
  },
  cluster: {
    label: "Cluster",
    color: "#7C3AED",
    bg: "#EDE9FE",
    icon: "🧩",
    grouping: false,
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

/** The catalog entry for a technique key, or null (no technique). */
export function techniqueInfo(
  technique: WorkoutTechnique | null | undefined,
): WorkoutTechniqueInfo | null {
  return technique ? WORKOUT_TECHNIQUE_CATALOG[technique] : null;
}

/** Whether a technique groups consecutive exercises (super set / giant set). */
export function isGroupingTechnique(
  technique: WorkoutTechnique | null | undefined,
): boolean {
  return Boolean(technique && WORKOUT_TECHNIQUE_CATALOG[technique].grouping);
}
