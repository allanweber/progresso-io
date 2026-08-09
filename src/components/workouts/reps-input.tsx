"use client";

import type { WorkoutReps } from "@/lib/workouts";

/**
 * Edits an exercise's repetitions — one of number / range / failure. A segmented
 * control picks the kind; number/range reveal small numeric inputs. Emits a
 * `WorkoutReps` value the builder stores and the API validates.
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
                onChange({ kind: "range", min: 8, max: 12 });
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
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={value.min}
            onChange={(e) =>
              onChange({ kind: "range", min: parse(e.target.value), max: value.max })
            }
            aria-label="Repetições mínimas"
            className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-center text-sm font-bold text-foreground outline-none focus:border-primary"
          />
          <span className="text-muted-foreground">–</span>
          <input
            inputMode="numeric"
            value={value.max}
            onChange={(e) =>
              onChange({ kind: "range", min: value.min, max: parse(e.target.value) })
            }
            aria-label="Repetições máximas"
            className="w-full min-w-0 rounded-lg border border-border bg-white px-2 py-2 text-center text-sm font-bold text-foreground outline-none focus:border-primary"
          />
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
