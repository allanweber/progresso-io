"use client";

import { Minus, Plus, TrendingUp } from "lucide-react";

import { NumberField } from "@/components/workouts/number-field";
import {
  DEFAULT_DURATION_SECONDS,
  formatSeconds,
  normalizeReps,
  type WorkoutReps,
} from "@/lib/workouts";

/** An editor for a reps **sequence** (2+ positions) — shared by intervalo + pirâmide. */
function SequenceEditor({
  kind,
  values,
  onChange,
  hint,
}: {
  kind: "range" | "pyramid";
  values: number[];
  onChange: (values: number[]) => void;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground">–</span>}
            <NumberField
              value={v}
              onCommit={(n) => {
                const next = values.slice();
                next[i] = n;
                onChange(next);
              }}
              min={1}
              max={1000}
              ariaLabel={`Posição ${i + 1}`}
              inputClassName="w-14 rounded-lg border border-border bg-white px-2 py-2 text-center text-body font-semibold tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
            />
          </div>
        ))}
        <button
          type="button"
          aria-label="Adicionar posição"
          title="Adicionar posição"
          onClick={() => onChange([...values, values[values.length - 1] ?? 8])}
          className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
        </button>
        {values.length > 2 && (
          <button
            type="button"
            aria-label="Remover posição"
            title="Remover posição"
            onClick={() => onChange(values.slice(0, -1))}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            <Minus className="size-4" />
          </button>
        )}
      </div>
      <p className="text-label text-muted-foreground">{hint}</p>
      {kind === "pyramid" && (
        <p className="flex items-center gap-1 text-label font-medium text-primary">
          <TrendingUp className="size-3 shrink-0" aria-hidden />
          Uma série por posição — a cada série o peso aumenta e as repetições
          diminuem.
        </p>
      )}
    </div>
  );
}

/**
 * Edits an exercise's repetitions — número / intervalo / pirâmide / tempo /
 * falha. A segmented control picks the kind. **Intervalo** and **Pirâmide** are
 * both a sequence of 2+ values (crescente or decrescente, e.g. `8-12` or
 * `12-10-8-6`); a pirâmide additionally signals that the load rises each set and
 * that each position **is** a série (the builder derives Séries from it).
 * **Tempo** prescribes seconds per set instead of reps. Emits a `WorkoutReps`
 * value the builder stores and the API validates.
 */
export function RepsInput({
  value: rawValue,
  onChange,
}: {
  value: WorkoutReps;
  onChange: (reps: WorkoutReps) => void;
}) {
  // Tolerate a legacy stored shape when editing an older workout.
  const value = normalizeReps(rawValue);

  return (
    <div className="space-y-1.5">
      {/* 3-up then 2-up: five kinds never fit one row on a phone. The gap-px
          over a bordered container draws the dividers. */}
      <div className="grid grid-cols-6 gap-px overflow-hidden rounded-lg border border-border bg-border text-label font-medium">
        {(
          [
            ["fixed", "Número", "col-span-2"],
            ["range", "Intervalo", "col-span-2"],
            ["pyramid", "Pirâmide", "col-span-2"],
            ["duration", "Tempo", "col-span-3"],
            ["failure", "Falha", "col-span-3"],
          ] as const
        ).map(([kind, label, span]) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              if (kind === value.kind) return;
              if (kind === "fixed") onChange({ kind: "fixed", value: 10 });
              else if (kind === "range")
                onChange({ kind: "range", values: [8, 12] });
              else if (kind === "pyramid")
                onChange({ kind: "pyramid", values: [12, 10, 8, 6] });
              else if (kind === "duration")
                onChange({
                  kind: "duration",
                  seconds: DEFAULT_DURATION_SECONDS,
                });
              else onChange({ kind: "failure" });
            }}
            className={`${span} px-1.5 py-1.5 ${
              value.kind === kind
                ? "bg-primary text-white"
                : "bg-white text-[#475569] hover:bg-surface-light"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.kind === "fixed" && (
        <NumberField
          value={value.value}
          onCommit={(n) => onChange({ kind: "fixed", value: n })}
          min={1}
          max={1000}
          stepper
          ariaLabel="Repetições"
          inputClassName="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-center text-body font-semibold tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
        />
      )}

      {value.kind === "range" && (
        <SequenceEditor
          kind="range"
          values={value.values}
          onChange={(values) => onChange({ kind: "range", values })}
          hint="Ex.: 8-12, ou uma sequência 10-8-6-4."
        />
      )}

      {value.kind === "pyramid" && (
        <SequenceEditor
          kind="pyramid"
          values={value.values}
          onChange={(values) => onChange({ kind: "pyramid", values })}
          hint="Ex.: 12-10-8-6 (repetições por série, da 1ª à última)."
        />
      )}

      {value.kind === "duration" && (
        <div className="space-y-1.5">
          <NumberField
            value={value.seconds}
            onCommit={(seconds) => onChange({ kind: "duration", seconds })}
            min={1}
            max={3600}
            step={5}
            maxDigits={4}
            stepper
            ariaLabel="Tempo em segundos"
            inputClassName="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-center text-body font-semibold tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
          />
          <p className="text-label text-muted-foreground">
            Segundos por série ({formatSeconds(value.seconds)}) — para prancha,
            isometria ou cardio.
          </p>
        </div>
      )}

      {value.kind === "failure" && (
        <div className="rounded-lg border border-dashed border-border py-2 text-center text-body font-medium text-muted-foreground">
          Até a falha
        </div>
      )}
    </div>
  );
}
