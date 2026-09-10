import { z } from "@/lib/validation";

/**
 * Client-safe body-assessment domain: the circumference + skinfold site catalog
 * (values + PT-BR labels, the standard avaliação física), the zod schema the
 * coach form/routes validate against, and the DTO the reads return. Only erased
 * `import type`s cross into the schema, so this bundles into client code.
 *
 * An assessment is the OPTIONAL structured record a coach captures during a
 * check-in review or an in-person check-in: circumferences (cm), skinfolds (mm)
 * and an optional body-fat %. Weight is NOT here — it lives on the check-in row
 * (`student_checkin.weightKg`); see docs/coach-feedback.md.
 */

/* -------------------------------------------------------------------------- */
/*  Site catalogs                                                             */
/* -------------------------------------------------------------------------- */

/** Circumference sites, in cm (the full standard avaliação, bilateral split). */
export const CIRCUMFERENCE_SITES = [
  "pescoco",
  "ombro",
  "torax",
  "cintura",
  "abdomen",
  "quadril",
  "braco_direito",
  "braco_esquerdo",
  "antebraco_direito",
  "antebraco_esquerdo",
  "coxa_direita",
  "coxa_esquerda",
  "panturrilha_direita",
  "panturrilha_esquerda",
] as const;
export type CircumferenceSite = (typeof CIRCUMFERENCE_SITES)[number];

export const CIRCUMFERENCE_LABELS: Record<CircumferenceSite, string> = {
  pescoco: "Pescoço",
  ombro: "Ombro",
  torax: "Tórax",
  cintura: "Cintura",
  abdomen: "Abdômen",
  quadril: "Quadril",
  braco_direito: "Braço D",
  braco_esquerdo: "Braço E",
  antebraco_direito: "Antebraço D",
  antebraco_esquerdo: "Antebraço E",
  coxa_direita: "Coxa D",
  coxa_esquerda: "Coxa E",
  panturrilha_direita: "Panturrilha D",
  panturrilha_esquerda: "Panturrilha E",
};

/** Skinfold sites, in mm (the 7-site Jackson-Pollock protocol). */
export const SKINFOLD_SITES = [
  "tricipital",
  "subescapular",
  "peitoral",
  "axilar_media",
  "suprailiaca",
  "abdominal",
  "coxa",
] as const;
export type SkinfoldSite = (typeof SKINFOLD_SITES)[number];

export const SKINFOLD_LABELS: Record<SkinfoldSite, string> = {
  tricipital: "Tricipital",
  subescapular: "Subescapular",
  peitoral: "Peitoral",
  axilar_media: "Axilar média",
  suprailiaca: "Suprailíaca",
  abdominal: "Abdominal",
  coxa: "Coxa",
};

/** Only the sites that were actually measured are stored (jsonb). */
export type CheckinCircumferences = Partial<Record<CircumferenceSite, number>>;
export type CheckinSkinfolds = Partial<Record<SkinfoldSite, number>>;

/**
 * Which measurement protocol an avaliação física follows — a **form preset**,
 * not a formula selector.
 *
 * It decides which of the 21 measurement inputs are rendered, and nothing else:
 * a body-fat percentage still comes from the full 7-fold protocol or from the
 * photos, never from a partial fold set (see src/lib/body-composition.ts). That
 * is why the form says so when the preset cannot support calipers — a coach who
 * picks it is choosing a visual estimate, and should know that before spending
 * a credit.
 *
 * - `completa`      — all 14 circumferences + all 7 folds. The full avaliação.
 * - `basica`        — the four circumferences that actually move, no folds.
 * - `so_peso`       — no measurements at all; weight and photos carry it.
 * - `personalizada` — every site available, none implied. The escape hatch, and
 *   what every row written before presets existed reads as.
 *
 * Declared here rather than in the schema because the form, the zod parse and
 * the preset selector are all client-side, and `@/db/schema` must not be
 * value-imported into a browser bundle.
 */
export const ASSESSMENT_PRESETS = [
  "completa",
  "basica",
  "so_peso",
  "personalizada",
] as const;
export type AssessmentPreset = (typeof ASSESSMENT_PRESETS)[number];

/**
 * Where a stored body-fat percentage came from. Not bookkeeping: a caliper
 * reading and a model's look at four phone photos are different classes of
 * fact, and the evolution chart draws them differently so a trend line never
 * silently mixes them.
 *
 * - `skinfolds` — computed by the server, Jackson-Pollock 7-site → Siri.
 * - `estimate`  — the model's visual estimate, accepted by the coach.
 * - `manual`    — typed in by the coach, from their own device or judgement.
 */
export const BODY_FAT_SOURCES = ["skinfolds", "estimate", "manual"] as const;
export type BodyFatSource = (typeof BODY_FAT_SOURCES)[number];

/* -------------------------------------------------------------------------- */
/*  Presets                                                                   */
/*                                                                            */
/*  Which of the 21 measurement inputs the form renders. A preset is a VIEW    */
/*  over the same site catalog — it never changes what a stored value means,   */
/*  and it never changes how a body-fat percentage is computed.                */
/* -------------------------------------------------------------------------- */

/**
 * The sites each preset asks for. `personalizada` maps to everything, which is
 * both the escape hatch and what the old flat form was.
 *
 * `basica` is the interesting one: four circumferences, no folds. It is not a
 * cut-down avaliação so much as *the measurements that move* — cintura and
 * quadril carry almost all the signal about fat distribution over a month, and
 * braço and coxa are what an aluno notices. A coach who wants a body-fat number
 * from calipers picks `completa`; a coach on a phone with an online aluno picks
 * this and gets through it.
 */
export const ASSESSMENT_PRESET_SITES: Record<
  AssessmentPreset,
  { circumferences: readonly CircumferenceSite[]; skinfolds: readonly SkinfoldSite[] }
> = {
  completa: { circumferences: CIRCUMFERENCE_SITES, skinfolds: SKINFOLD_SITES },
  basica: {
    circumferences: ["cintura", "quadril", "braco_direito", "coxa_direita"],
    skinfolds: [],
  },
  so_peso: { circumferences: [], skinfolds: [] },
  personalizada: {
    circumferences: CIRCUMFERENCE_SITES,
    skinfolds: SKINFOLD_SITES,
  },
};

export const ASSESSMENT_PRESET_LABELS: Record<AssessmentPreset, string> = {
  completa: "Completa (14 circunferências + 7 dobras)",
  basica: "Básica (cintura, quadril, braço, coxa)",
  so_peso: "Só peso",
  personalizada: "Personalizada (todos os campos)",
};

/**
 * Whether this preset can produce a caliper-derived body fat.
 *
 * Only the presets that ask for all seven folds can: the Jackson-Pollock
 * polynomial is fitted to the sum of seven sites, so a partial set gives a
 * wrong number rather than a rougher one. The form says this out loud when the
 * answer is `false`, so a coach chooses a visual estimate knowingly instead of
 * discovering it after spending a credit.
 */
export function presetSupportsSkinfoldBodyFat(preset: AssessmentPreset): boolean {
  return ASSESSMENT_PRESET_SITES[preset].skinfolds.length === SKINFOLD_SITES.length;
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One optional measurement value. Comes in as a string (form input) or a number
 * (JSON), blank/absent → null, comma decimal normalized, bounded, rounded to one
 * decimal. `max` bounds it: circumferences/skinfolds ≤ 300, body-fat ≤ 70.
 */
function measureField(max: number) {
  return z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim().replace(",", ".");
      return s === "" ? null : Number(s);
    })
    .refine(
      (n) => n === null || (Number.isFinite(n) && n > 0 && n <= max),
      `Valor inválido (0–${max}).`,
    )
    .transform((n) => (n === null ? null : Math.round(n * 10) / 10));
}

/**
 * A record of measurement sites → value. Keyed loosely (string) to sidestep
 * zod's "all enum keys required" record typing, then pruned to the KNOWN sites
 * with a real numeric value — so the output is exactly `Partial<Record<K,
 * number>>` (only the sites that were measured), which is what we persist.
 */
function siteRecordSchema<K extends string>(sites: readonly K[], max: number) {
  const allowed = new Set<string>(sites);
  return z
    .record(z.string(), measureField(max))
    .default({})
    .transform((rec) => {
      const out: Partial<Record<K, number>> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (allowed.has(k) && typeof v === "number") out[k as K] = v;
      }
      return out;
    });
}

/**
 * The optional body assessment. Every field is optional; only measured sites
 * survive. The route treats an assessment with no values at all as
 * "no assessment" (see {@link assessmentHasValues}).
 */
export const assessmentSchema = z.object({
  circumferences: siteRecordSchema(CIRCUMFERENCE_SITES, 300),
  skinfolds: siteRecordSchema(SKINFOLD_SITES, 300),
  bodyFatPct: measureField(70).default(null),
  /**
   * The preset the coach filled it with. Stored so a historic assessment
   * renders as the protocol it was taken with rather than as an incomplete
   * version of whatever the clinic uses today. Optional: a client that does not
   * send one leaves the column null, exactly like every pre-existing row.
   */
  protocol: z.enum(ASSESSMENT_PRESETS).nullable().default(null),
});

export type AssessmentInput = z.input<typeof assessmentSchema>;
export type AssessmentValues = z.output<typeof assessmentSchema>;

/** Whether a parsed assessment carries at least one real value. */
export function assessmentHasValues(a: AssessmentValues): boolean {
  return (
    a.bodyFatPct !== null ||
    Object.values(a.circumferences).some((v) => typeof v === "number") ||
    Object.values(a.skinfolds).some((v) => typeof v === "number")
  );
}

/* -------------------------------------------------------------------------- */
/*  DTO                                                                        */
/* -------------------------------------------------------------------------- */

/** A stored assessment as the reads return it (only measured sites present). */
export type CheckinAssessmentDto = {
  assessedAt: string;
  circumferences: CheckinCircumferences;
  skinfolds: CheckinSkinfolds;
  bodyFatPct: number | null;
  /** Where the percentage came from. NULL on rows written before this existed. */
  bodyFatSource: BodyFatSource | null;
  /** The preset it was taken with. NULL on rows that predate presets. */
  protocol: AssessmentPreset | null;
};
