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
};
