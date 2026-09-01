"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";

import { ExerciseImageButton } from "@/components/workouts/exercise-images";
import { apiFetch } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseListResponse,
  type Muscle,
} from "@/lib/exercises";

/** An exercise chosen through the search (identity + facets for the row). */
export type PickedExercise = {
  id: string;
  name: string;
  code: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  thumbnail: string | null;
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
 * navigate with ↑/↓, Enter to select, Esc to close. Emits the picked exercise;
 * the caller decides what to do next (prescribe it, or add it as a substitute).
 */
export function ExerciseSearch({
  excludeIds = [],
  placeholder = "Buscar exercício (ex: supino, agachamento…)",
  onPick,
  onClose,
  autoFocus = true,
}: {
  excludeIds?: string[];
  placeholder?: string;
  onPick: (exercise: PickedExercise) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
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

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) onPick(toPicked(item));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-rest">
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
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-9 text-body text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
            <div className="flex items-center justify-center gap-2 py-6 text-body text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Buscando exercícios…
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-body text-muted-foreground">
              Nenhum exercício encontrado.
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-[#F5F7FA] overflow-y-auto">
              {results.map((f, i) => (
                // The thumbnail is its own control (it expands the images), so
                // the row is a flex container, not one big button.
                <li
                  key={f.id}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-2 py-2.5 ${
                    i === activeIndex ? "bg-primary/5" : "bg-white"
                  }`}
                >
                  <ExerciseImageButton
                    exerciseId={f.id}
                    name={f.name}
                    thumbnail={f.thumbnail}
                    className="size-9 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => onPick(toPicked(f))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-body font-medium text-foreground">
                      {f.name}
                    </span>
                    <span className="block truncate text-label text-muted-foreground">
                      {CATEGORY_LABELS[f.category]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 px-2 pt-1 text-label text-muted-foreground">
            ↑ ↓ navegar · Enter selecionar · Esc fechar · toque na imagem para
            ampliar
          </div>
        </div>
      )}

      {!enabled && (
        <div className="mt-2 px-2 py-3 text-label text-muted-foreground">
          Digite ao menos 2 letras para buscar.
        </div>
      )}
    </div>
  );
}
