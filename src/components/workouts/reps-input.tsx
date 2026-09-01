"use client";

import { useState } from "react";
import { Check, ChevronDown, Minus, Plus, TrendingUp } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  NumberField,
  numberFieldClass,
} from "@/components/workouts/number-field";
import {
  DEFAULT_DURATION_SECONDS,
  formatSeconds,
  normalizeReps,
  type WorkoutReps,
} from "@/lib/workouts";

type RepsKind = WorkoutReps["kind"];

/**
 * The five ways to prescribe reps, each with the one-line PT-BR explanation the
 * coach reads while choosing. Ordered by how often a coach reaches for it — the
 * chip menu is the only place the rarer kinds have to announce themselves.
 */
const REPS_KINDS: { kind: RepsKind; label: string; hint: string }[] = [
  {
    kind: "range",
    label: "Intervalo",
    hint: "Uma faixa como 8-12, ou uma sequência maior.",
  },
  { kind: "fixed", label: "Número", hint: "Sempre a mesma contagem." },
  {
    kind: "pyramid",
    label: "Pirâmide",
    hint: "Carga sobe e repetições descem a cada série.",
  },
  {
    kind: "duration",
    label: "Tempo",
    hint: "Prancha, isometria, cardio — vale o relógio.",
  },
  { kind: "failure", label: "Falha", hint: "Sem número: vai até não sair mais." },
];

const kindLabel = (kind: RepsKind) =>
  REPS_KINDS.find((k) => k.kind === kind)?.label ?? "Intervalo";

function freshReps(kind: RepsKind): WorkoutReps {
  switch (kind) {
    case "fixed":
      return { kind: "fixed", value: 10 };
    case "range":
      return { kind: "range", values: [8, 12] };
    case "pyramid":
      return { kind: "pyramid", values: [12, 10, 8, 6] };
    case "duration":
      return { kind: "duration", seconds: DEFAULT_DURATION_SECONDS };
    case "failure":
      return { kind: "failure" };
  }
}

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
      {/* A four-position pirâmide plus both controls overruns the Repetições
          column, so the sequence wraps — but the + / − pair must wrap as one
          unit, never leaving a lone − stranded on its own line. */}
      <div className="flex flex-wrap items-center gap-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
            )}
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
              inputClassName={`${numberFieldClass} w-12 px-1.5 font-semibold`}
            />
          </div>
        ))}
        <div className="ml-0.5 flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Adicionar posição"
            title="Adicionar posição"
            onClick={() => onChange([...values, values[values.length - 1] ?? 8])}
            className="flex size-11 items-center justify-center rounded-[10px] border-[1.5px] border-input text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
          </button>
          {values.length > 2 && (
            <button
              type="button"
              aria-label="Remover posição"
              title="Remover posição"
              onClick={() => onChange(values.slice(0, -1))}
              className="flex size-11 items-center justify-center rounded-[10px] border-[1.5px] border-input text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            >
              <Minus className="size-4" />
            </button>
          )}
        </div>
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
 * falha. All five kinds survive, but only the one **in use** costs vertical
 * space: the field renders its own header (`Repetições`, or `Tempo` for a
 * duração) with a chip naming the current kind, and the other four live one tap
 * away inside that chip's menu. **Intervalo** and **Pirâmide** are both a
 * sequence of 2+ values (`8-12`, `12-10-8-6`); a pirâmide additionally signals
 * that the load rises each set and that each position **is** a série (the
 * builder derives Séries from it). Emits a `WorkoutReps` value the builder
 * stores and the API validates.
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      {/* The header carries the kind chip, so choosing a kind costs no row of
          its own. h-8 keeps this baseline aligned with the Séries label. */}
      <div className="flex h-8 items-center justify-between gap-2">
        <Label>{value.kind === "duration" ? "Tempo" : "Repetições"}</Label>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Tipo de repetições: ${kindLabel(value.kind)}. Alterar.`}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-surface-light px-3 text-label font-medium text-[#475569] transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
            >
              {kindLabel(value.kind)}
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-1.5">
            <ul>
              {REPS_KINDS.map((k) => {
                const current = k.kind === value.kind;
                return (
                  <li key={k.kind}>
                    <button
                      type="button"
                      aria-current={current || undefined}
                      onClick={() => {
                        if (!current) onChange(freshReps(k.kind));
                        setMenuOpen(false);
                      }}
                      className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        current ? "bg-primary/5" : "hover:bg-surface-light"
                      }`}
                    >
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          current ? "text-primary" : "text-transparent"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-body font-medium text-foreground">
                          {k.label}
                        </span>
                        <span className="block text-label text-muted-foreground">
                          {k.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      {value.kind === "fixed" && (
        <NumberField
          value={value.value}
          onCommit={(n) => onChange({ kind: "fixed", value: n })}
          min={1}
          max={1000}
          stepper
          ariaLabel="Repetições"
          inputClassName={`${numberFieldClass} min-w-0 flex-1 px-3 font-semibold`}
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
            inputClassName={`${numberFieldClass} min-w-0 flex-1 px-3 font-semibold`}
          />
          <p className="text-label text-muted-foreground">
            Segundos por série ({formatSeconds(value.seconds)}) — para prancha,
            isometria ou cardio.
          </p>
        </div>
      )}

      {value.kind === "failure" && (
        <div className="flex h-11 items-center justify-center rounded-lg border border-dashed border-border text-body font-medium text-muted-foreground">
          Até a falha
        </div>
      )}
    </div>
  );
}
