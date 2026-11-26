"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

import { ExerciseMediaButton } from "@/components/exercises/exercise-media";
import { apiFetch } from "@/lib/api-client";
import {
  BODY_PART_LABELS,
  EQUIPMENT_LABELS,
  EXERCISE_BODY_PARTS,
  TARGET_LABELS,
  type ExerciseBodyPart,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseListResponse,
  type ExerciseTarget,
} from "@/lib/exercises";

/** An exercise chosen through the search (identity + facets for the row). */
export type PickedExercise = {
  id: string;
  name: string;
  code: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  target: ExerciseTarget;
  image: string | null;
};

function toPicked(item: ExerciseListResponse["items"][number]): PickedExercise {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    category: item.category,
    equipment: item.equipment,
    target: item.target,
    image: item.image,
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
  const [bodyPart, setBodyPart] = useState<ExerciseBodyPart | "">("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function updateScroll() {
    const el = chipsRef.current;
    if (!el) return;
    setCanScroll({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }

  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function scrollChips(direction: 1 | -1) {
    const el = chipsRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  }

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = search.length >= 2 || Boolean(bodyPart);
  const { data, isFetching } = useQuery({
    queryKey: ["exercise-picker", search, bodyPart],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (bodyPart) p.set("bodyPart", bodyPart);
      p.set("pageSize", "20");
      return apiFetch<ExerciseListResponse>(`/api/exercises?${p.toString()}`);
    },
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
    <div className="rounded-xl border border-border bg-card p-3 shadow-rest">
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
          className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-9 text-body text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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

      <div className="relative mt-2">
        <div
          ref={chipsRef}
          onScroll={updateScroll}
          className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Região do corpo"
        >
          {EXERCISE_BODY_PARTS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={bodyPart === b}
              onClick={() => {
                setBodyPart(bodyPart === b ? "" : b);
                setActive(0);
                inputRef.current?.focus();
              }}
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-label font-medium transition-colors ${
                bodyPart === b
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:border-primary"
              }`}
            >
              {BODY_PART_LABELS[b]}
              {bodyPart === b && <X className="size-3" aria-hidden />}
            </button>
          ))}
        </div>
        {canScroll.left && (
          <button
            type="button"
            onClick={() => scrollChips(-1)}
            aria-label="Ver regiões anteriores"
            className="absolute inset-y-0 left-0 mb-1 flex items-center bg-gradient-to-r from-card via-card to-transparent pr-4"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronLeft className="size-4" aria-hidden />
            </span>
          </button>
        )}
        {canScroll.right && (
          <button
            type="button"
            onClick={() => scrollChips(1)}
            aria-label="Ver mais regiões"
            className="absolute inset-y-0 right-0 mb-1 flex items-center bg-gradient-to-l from-card via-card to-transparent pl-4"
          >
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronRight className="size-4" aria-hidden />
            </span>
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
            <ul className="max-h-72 divide-y divide-border-light overflow-y-auto">
              {results.map((f, i) => (
                // The thumbnail is its own control (it expands the images), so
                // the row is a flex container, not one big button.
                <li
                  key={f.id}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-2 py-2.5 ${
                    i === activeIndex ? "bg-primary/5" : "bg-card"
                  }`}
                >
                  <ExerciseMediaButton
                    exerciseId={f.id}
                    name={f.name}
                    image={f.image}
                    className="size-10 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => onPick(toPicked(f))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-body font-medium text-foreground">
                      {f.name}
                    </span>
                    {f.nameEn && f.nameEn !== f.name && (
                      <span
                        lang="en"
                        className="block truncate text-label italic text-muted-foreground"
                      >
                        {f.nameEn}
                      </span>
                    )}
                    <span className="block truncate text-label text-muted-foreground">
                      {TARGET_LABELS[f.target]} · {EQUIPMENT_LABELS[f.equipment]}
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
          Digite ao menos 2 letras ou escolha uma região do corpo.
        </div>
      )}
    </div>
  );
}
