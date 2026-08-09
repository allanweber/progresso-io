"use client";

import { Minus, Plus } from "lucide-react";

import type { WorkoutReps } from "@/lib/workouts";

/**
 * Edits an exercise's repetitions — number / interval / falha. A segmented
 * control picks the kind. **Interval** is a sequence of 2+ values, crescente or
 * decrescente (e.g. `8-12`, or a pyramid `10-8-6-4`): positions can be added or
 * removed. Emits a `WorkoutReps` value the builder stores and the API validates.
 */
export function RepsInput({
  value,
  onChange,
}: {
  value: WorkoutReps;
  onChange: (reps: WorkoutReps) => void;
}) {
  const clampRep = (n: number) => Math.max(1, Math.min(1000, n));
  const parse = (raw: string) => clampRep(parseInt(raw.replace(/\D/g, ""), 10) || 1);

  return (
    <div className="space-y-1.5">
      <div className="flex overflow-hidden rounded-lg border border-border text-[12px] font-medium">
        {(
          [
            ["fixed", "Número"],
            ["range", "Intervalo"],
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
              else onChange({ kind: "failure" });
            }}
            className={`flex-1 px-2 py-1.5 ${
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
        <input
          inputMode="numeric"
          value={value.value}
          onChange={(e) => onChange({ kind: "fixed", value: parse(e.target.value) })}
          aria-label="Repetições"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-center text-sm font-bold text-foreground outline-none focus:border-primary"
        />
      )}

      {value.kind === "range" && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {value.values.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">–</span>}
                <input
                  inputMode="numeric"
                  value={v}
                  onChange={(e) => {
                    const next = value.values.slice();
                    next[i] = parse(e.target.value);
                    onChange({ kind: "range", values: next });
                  }}
                  aria-label={`Posição ${i + 1}`}
                  className="w-14 rounded-lg border border-border bg-white px-2 py-2 text-center text-sm font-bold text-foreground outline-none focus:border-primary"
                />
              </div>
            ))}
            <button
              type="button"
              aria-label="Adicionar posição"
              title="Adicionar posição"
              onClick={() =>
                onChange({
                  kind: "range",
                  values: [
                    ...value.values,
                    value.values[value.values.length - 1] ?? 8,
                  ],
                })
              }
              className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="size-4" />
            </button>
            {value.values.length > 2 && (
              <button
                type="button"
                aria-label="Remover posição"
                title="Remover posição"
                onClick={() =>
                  onChange({ kind: "range", values: value.values.slice(0, -1) })
                }
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                <Minus className="size-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ex.: 8-12, ou pirâmide 10-8-6-4.
          </p>
        </div>
      )}

      {value.kind === "failure" && (
        <div className="rounded-lg border border-dashed border-border py-2 text-center text-sm font-medium text-muted-foreground">
          Até a falha
        </div>
      )}
    </div>
  );
}
