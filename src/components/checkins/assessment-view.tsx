"use client";

import {
  CIRCUMFERENCE_LABELS,
  CIRCUMFERENCE_SITES,
  SKINFOLD_LABELS,
  SKINFOLD_SITES,
  type CheckinAssessmentDto,
} from "@/lib/checkin-assessment";
import { formatCheckinWeight } from "@/lib/student-checkins";

/**
 * Read-only display of a captured body assessment — only the measured sites,
 * grouped into circumferences (cm) and skinfolds (mm), plus body-fat %. Shared
 * by the coach check-in detail and the aluno's detail modal.
 */
export function AssessmentView({
  assessment,
}: {
  assessment: CheckinAssessmentDto;
}) {
  const circ = CIRCUMFERENCE_SITES.filter(
    (s) => typeof assessment.circumferences[s] === "number",
  ).map((s) => ({ label: CIRCUMFERENCE_LABELS[s], value: assessment.circumferences[s]! }));
  const skin = SKINFOLD_SITES.filter(
    (s) => typeof assessment.skinfolds[s] === "number",
  ).map((s) => ({ label: SKINFOLD_LABELS[s], value: assessment.skinfolds[s]! }));

  if (circ.length === 0 && skin.length === 0 && assessment.bodyFatPct === null) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3.5 dark:bg-card">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Avaliação</span>
        {assessment.bodyFatPct !== null ? (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-semibold text-primary">
            {formatCheckinWeight(assessment.bodyFatPct)}% de gordura
          </span>
        ) : null}
      </div>

      {circ.length > 0 ? (
        <div className="mb-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Circunferências (cm)
          </div>
          <MeasureList items={circ} />
        </div>
      ) : null}

      {skin.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Dobras (mm)
          </div>
          <MeasureList items={skin} />
        </div>
      ) : null}
    </div>
  );
}

function MeasureList({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-baseline justify-between gap-2 text-[12.5px]"
        >
          <span className="text-muted-foreground">{it.label}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatCheckinWeight(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
