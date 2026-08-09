"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Search, X } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  exerciseImageUrl,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseListResponse,
  type Muscle,
} from "@/lib/exercises";
import { RepsInput } from "@/components/workouts/reps-input";
import type { WorkoutReps } from "@/lib/workouts";

/** An exercise chosen through the picker (identity + facets for the row). */
export type PickedExercise = {
  id: string;
  name: string;
  code: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  thumbnail: string | null;
};

type Props = {
  /**
   * "full" shows the prescription panel (séries/reps/descanso) after selecting;
   * "pick" emits the exercise immediately (used to add a custom substitute).
   */
  mode?: "full" | "pick";
  /** Exercise ids to hide from the results (already in the ficha, or the item itself). */
  excludeIds?: string[];
  onPick: (picked: {
    exercise: PickedExercise;
    sets: number;
    reps: WorkoutReps;
    rest: number;
  }) => void;
  onClose?: () => void;
  autoFocus?: boolean;
};

function toPicked(item: ExerciseListResponse["items"][number]): PickedExercise {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    category: item.category,
    equipment: item.equipment,
    primaryMuscles: item.primaryMuscles,
    thumbnail: item.thumbnail,
  };
}

/**
 * Exercise search-and-select, styled after the "Adicionar exercício" mockup.
 * Type to search the catalog (base + this clinic's own, via `/api/exercises`),
 * navigate with ↑/↓, Enter to select, Esc to close. In "full" mode a second step
 * sets séries / reps / descanso before confirming.
 */
export function ExercisePicker({
  mode = "full",
  excludeIds = [],
  onPick,
  onClose,
  autoFocus = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PickedExercise | null>(null);
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState<WorkoutReps>({ kind: "range", min: 8, max: 12 });
  const [rest, setRest] = useState(90);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = search.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["exercise-picker", search],
    queryFn: () =>
      apiFetch<ExerciseListResponse>(
        `/api/exercises?search=${encodeURIComponent(search)}&pageSize=8`,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

  const results = useMemo(
    () => (data?.items ?? []).filter((f) => !excludeIds.includes(f.id)),
    [data, excludeIds],
  );
  const activeIndex = results.length ? Math.min(active, results.length - 1) : 0;

  function choose(exercise: PickedExercise) {
    if (mode === "pick") {
      onPick({ exercise, sets: 3, reps: { kind: "range", min: 8, max: 12 }, rest: 90 });
      reset();
      return;
    }
    setSelected(exercise);
    setSets(3);
    setReps({ kind: "range", min: 8, max: 12 });
    setRest(90);
  }

  function reset() {
    setQuery("");
    setSearch("");
    setSelected(null);
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (selected) setSelected(null);
      else onClose?.();
      return;
    }
    if (selected || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) choose(toPicked(item));
    }
  }

  // Prescription step ------------------------------------------------------
  if (selected) {
    const thumb = exerciseImageUrl(selected.thumbnail);
    return (
      <div className="rounded-xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          ‹ Voltar aos resultados
        </button>
        <div className="mb-4 flex items-center gap-3">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="size-11 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="size-11 shrink-0 rounded-lg bg-surface-light" />
          )}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {selected.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[selected.category]}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto]">
          <Stepper label="Séries" value={sets} min={1} max={50} onChange={setSets} />
          <div>
            <div className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Repetições
            </div>
            <RepsInput value={reps} onChange={setReps} />
          </div>
          <Stepper
            label="Descanso"
            value={rest}
            min={0}
            max={600}
            step={15}
            suffix="s"
            onChange={setRest}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            onPick({ exercise: selected, sets, reps, rest });
            reset();
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Adicionar ao treino
        </button>
      </div>
    );
  }

  // Search step ------------------------------------------------------------
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-[0_1px_8px_rgba(15,23,42,0.06)]">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Buscar exercício (ex: supino, agachamento…)"
          className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-9 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-2 flex size-6 items-center justify-center rounded-full bg-surface-light text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {enabled && (
        <div className="mt-2 overflow-hidden">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Buscando exercícios…
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum exercício encontrado.
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-[#F5F7FA] overflow-y-auto">
              {results.map((f, i) => {
                const thumb = exerciseImageUrl(f.thumbnail);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(toPicked(f))}
                      className={`flex w-full items-center gap-3 px-2 py-2.5 text-left ${
                        i === activeIndex ? "bg-primary/5" : "bg-white"
                      }`}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="size-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="size-9 shrink-0 rounded-md bg-surface-light" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {f.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {CATEGORY_LABELS[f.category]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-1 px-2 pt-1 text-[11px] text-muted-foreground">
            ↑ ↓ navegar · Enter selecionar · Esc fechar
          </div>
        </div>
      )}

      {!enabled && (
        <div className="mt-2 px-2 py-3 text-xs text-muted-foreground">
          Digite ao menos 2 letras para buscar.
        </div>
      )}
    </div>
  );
}

/** A small numeric stepper (séries / descanso). */
function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div>
      <div className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-border">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          className="w-8 shrink-0 bg-surface-light text-lg font-semibold text-[#334155] hover:bg-border/50"
          aria-label={`Diminuir ${label}`}
        >
          <Minus className="mx-auto size-3.5" />
        </button>
        <div className="relative flex min-w-14 flex-1 items-center justify-center">
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
              onChange(Number.isNaN(n) ? min : clamp(n));
            }}
            className="w-full min-w-0 border-none bg-transparent py-2 text-center text-lg font-bold text-foreground outline-none"
          />
          {suffix && (
            <span className="pointer-events-none absolute right-2 text-[11px] font-semibold text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          className="w-8 shrink-0 bg-surface-light text-lg font-semibold text-[#334155] hover:bg-border/50"
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="mx-auto size-3.5" />
        </button>
      </div>
    </div>
  );
}
