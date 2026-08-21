"use client";

import { Minus, Plus, TrendingUp } from "lucide-react";

import { NumberField } from "@/components/workouts/number-field";
import { normalizeReps, type WorkoutReps } from "@/lib/workouts";

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
              inputClassName="w-14 rounded-lg border border-border bg-white px-2 py-2 text-center text-body font-semibold tabular-nums text-foreground outline-none focus:border-primary"
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
          A cada série o peso aumenta e as repetições diminuem.
        </p>
      )}
    </div>
  );
}

/**
 * Edits an exercise's repetitions — número / intervalo / pirâmide / falha. A
 * segmented control picks the kind. **Intervalo** and **Pirâmide** are both a
 * sequence of 2+ values (crescente or decrescente, e.g. `8-12` or `12-10-8-6`);
 * a pirâmide additionally signals that the load rises each set. Emits a
 * `WorkoutReps` value the builder stores and the API validates.
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
      <div className="flex overflow-hidden rounded-lg border border-border text-label font-medium">
        {(
          [
            ["fixed", "Número"],
            ["range", "Intervalo"],
            ["pyramid", "Pirâmide"],
            ["failure", "Falha"],
          ] as const
        ).map(([kind, label]) => (
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
              else onChange({ kind: "failure" });
            }}
            className={`flex-1 px-1.5 py-1.5 ${
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
          inputClassName="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-center text-body font-semibold tabular-nums text-foreground outline-none focus:border-primary"
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

      {value.kind === "failure" && (
        <div className="rounded-lg border border-dashed border-border py-2 text-center text-body font-medium text-muted-foreground">
          Até a falha
        </div>
      )}
    </div>
  );
}
