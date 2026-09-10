"use client";

import {
  ASSESSMENT_PRESET_LABELS,
  ASSESSMENT_PRESET_SITES,
  ASSESSMENT_PRESETS,
  CIRCUMFERENCE_LABELS,
  CIRCUMFERENCE_SITES,
  presetSupportsSkinfoldBodyFat,
  SKINFOLD_LABELS,
  SKINFOLD_SITES,
  type AssessmentPreset,
  type CircumferenceSite,
  type SkinfoldSite,
} from "@/lib/checkin-assessment";
import type { CheckinAssessmentDto } from "@/lib/checkin-assessment";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCheckinWeight } from "@/lib/student-checkins";

/**
 * The optional body-assessment form (circumferences + skinfolds + body-fat %),
 * shared by the coach's review dialog and the manual check-in dialog. Controlled
 * — the parent owns a {@link AssessmentFormValues} (strings, form-friendly) and
 * gets `onChange`. `assessmentFormToPayload` turns it into the JSON the routes
 * expect (only the filled sites); the server's zod does the numeric parsing.
 */

export type AssessmentFormValues = {
  circumferences: Record<CircumferenceSite, string>;
  skinfolds: Record<SkinfoldSite, string>;
  bodyFatPct: string;
  /**
   * Which inputs are rendered. A view over the same site catalog — it never
   * changes what a stored value means, and it never changes how a body-fat
   * percentage is computed.
   */
  protocol: AssessmentPreset;
};

const emptyCirc = () =>
  Object.fromEntries(CIRCUMFERENCE_SITES.map((s) => [s, ""])) as Record<
    CircumferenceSite,
    string
  >;
const emptySkin = () =>
  Object.fromEntries(SKINFOLD_SITES.map((s) => [s, ""])) as Record<
    SkinfoldSite,
    string
  >;

export function emptyAssessmentForm(
  preset: AssessmentPreset = "completa",
): AssessmentFormValues {
  return {
    circumferences: emptyCirc(),
    skinfolds: emptySkin(),
    bodyFatPct: "",
    protocol: preset,
  };
}

/** Prefills the form from a stored assessment (measured sites → their value). */
export function assessmentFormFromDto(
  dto: CheckinAssessmentDto,
): AssessmentFormValues {
  const circ = emptyCirc();
  for (const s of CIRCUMFERENCE_SITES) {
    const v = dto.circumferences[s];
    if (typeof v === "number") circ[s] = formatCheckinWeight(v);
  }
  const skin = emptySkin();
  for (const s of SKINFOLD_SITES) {
    const v = dto.skinfolds[s];
    if (typeof v === "number") skin[s] = formatCheckinWeight(v);
  }
  return {
    circumferences: circ,
    skinfolds: skin,
    bodyFatPct: dto.bodyFatPct !== null ? formatCheckinWeight(dto.bodyFatPct) : "",
    // A row taken before presets existed has no protocol. It was filled on the
    // flat all-sites form, so `personalizada` is what it shows as — and showing
    // every site is also the only way its values all remain visible.
    protocol: dto.protocol ?? "personalizada",
  };
}

/** Whether the form carries at least one non-blank value. */
export function assessmentFormHasValues(v: AssessmentFormValues): boolean {
  return (
    v.bodyFatPct.trim() !== "" ||
    Object.values(v.circumferences).some((x) => x.trim() !== "") ||
    Object.values(v.skinfolds).some((x) => x.trim() !== "")
  );
}

/** The JSON payload for the routes: only the filled sites (server parses). */
export function assessmentFormToPayload(v: AssessmentFormValues): {
  circumferences: Record<string, string>;
  skinfolds: Record<string, string>;
  bodyFatPct: string;
  protocol: AssessmentPreset;
} {
  const pick = (rec: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(rec)) {
      if (val.trim() !== "") out[k] = val.trim();
    }
    return out;
  };
  return {
    circumferences: pick(v.circumferences),
    skinfolds: pick(v.skinfolds),
    bodyFatPct: v.bodyFatPct.trim(),
    protocol: v.protocol,
  };
}

function MeasureInput({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-caption font-medium text-muted-foreground">
        {label} <span className="text-muted-foreground/60">({unit})</span>
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-2.5 text-body-dense"
      />
    </div>
  );
}

export function AssessmentFields({
  value,
  onChange,
  idPrefix = "assess",
}: {
  value: AssessmentFormValues;
  onChange: (v: AssessmentFormValues) => void;
  idPrefix?: string;
}) {
  const sites = ASSESSMENT_PRESET_SITES[value.protocol];
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-protocol`}>Protocolo</Label>
        <Select
          value={value.protocol}
          onValueChange={(v) =>
            onChange({ ...value, protocol: v as AssessmentPreset })
          }
        >
          <SelectTrigger id={`${idPrefix}-protocol`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASSESSMENT_PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {ASSESSMENT_PRESET_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Said before the coach fills anything in, not after they spend a
            credit: only the full 7-fold protocol yields a calculated body fat.
            Anything shorter means the AI evaluation estimates from the photos. */}
        <p className="text-xs text-muted-foreground">
          {presetSupportsSkinfoldBodyFat(value.protocol)
            ? "Com as 7 dobras, a % de gordura é calculada (Jackson-Pollock)."
            : "Sem as 7 dobras, a % de gordura é estimada pelas fotos."}
        </p>
      </div>

      {sites.circumferences.length > 0 && (
      <section>
        <div className="mb-2 text-xs font-semibold text-foreground">
          Circunferências
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
          {sites.circumferences.map((site) => (
            <MeasureInput
              key={site}
              id={`${idPrefix}-c-${site}`}
              label={CIRCUMFERENCE_LABELS[site]}
              unit="cm"
              value={value.circumferences[site]}
              onChange={(v) =>
                onChange({
                  ...value,
                  circumferences: { ...value.circumferences, [site]: v },
                })
              }
            />
          ))}
        </div>
      </section>
      )}

      {sites.skinfolds.length > 0 && (
      <section>
        <div className="mb-2 text-xs font-semibold text-foreground">
          Dobras cutâneas
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
          {sites.skinfolds.map((site) => (
            <MeasureInput
              key={site}
              id={`${idPrefix}-s-${site}`}
              label={SKINFOLD_LABELS[site]}
              unit="mm"
              value={value.skinfolds[site]}
              onChange={(v) =>
                onChange({
                  ...value,
                  skinfolds: { ...value.skinfolds, [site]: v },
                })
              }
            />
          ))}
        </div>
      </section>
      )}

      <section className="max-w-[140px]">
        <MeasureInput
          id={`${idPrefix}-bf`}
          label="% de gordura"
          unit="%"
          value={value.bodyFatPct}
          onChange={(v) => onChange({ ...value, bodyFatPct: v })}
        />
      </section>
    </div>
  );
}
