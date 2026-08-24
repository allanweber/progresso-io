"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";

import {
  QuantityEditor,
  type PickedMeasure,
} from "@/components/foods/quantity-editor";
import { apiFetch } from "@/lib/api-client";
import type {
  FoodDetailDto,
  FoodListResponse,
  FoodOrigin,
} from "@/lib/foods";

/**
 * A food selected through the picker, carrying the per-100 g macros the caller
 * needs to render live totals without another fetch.
 */
export type PickedFood = {
  id: string;
  description: string;
  code: string | null;
  origin: FoodOrigin;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

/** A catalog substitute shown as a quick suggestion chip. */
export type FoodPickerSuggestion = {
  foodId: string;
  description: string;
  code: string | null;
  /** Suggested grams to prefill (already scaled to the item, when applicable). */
  grams: number;
};

type FoodPickerProps = {
  /** Show the grams step (mockup's quantity panel) and emit grams. */
  withQuantity?: boolean;
  /** Grams to prefill the quantity step with (default 100). */
  initialGrams?: number;
  /** Optional catalog suggestions shown above the search results. */
  suggestions?: FoodPickerSuggestion[];
  /** Emitted when the coach confirms a food (grams/measure null when !withQuantity). */
  onPick: (picked: {
    food: PickedFood;
    grams: number | null;
    measure: PickedMeasure;
  }) => void;
  /** Optional cancel/close control (renders an ✕). */
  onClose?: () => void;
  autoFocus?: boolean;
};

function toPicked(item: FoodListResponse["items"][number]): PickedFood {
  return {
    id: item.id,
    description: item.description,
    code: item.code,
    origin: item.origin,
    energyKcal: item.energyKcal,
    protein: item.protein,
    carbohydrate: item.carbohydrate,
    fat: item.fat,
  };
}

/** Scales a per-100 g value by grams, rounding for display. */
function scaled(value: number | null, grams: number, decimals = 0): string {
  if (value === null || value === undefined) return "—";
  const n = (value * grams) / 100;
  return (decimals === 0 ? Math.round(n) : Number(n.toFixed(decimals)))
    .toString()
    .replace(".", ",");
}

/**
 * Reusable food search-and-select, styled after the "Adicionar alimento" mockup.
 * Type to search the catalog (base + this clinic's own, via `/api/foods`),
 * navigate with ↑/↓, Enter to select, Esc to close. With `withQuantity`, a second
 * step sets the grams and shows the scaled macros before confirming. Generic and
 * domain-agnostic: it only knows foods, so the diet builder (and future callers)
 * reuse it for both "pick a food" and "pick a food + grams".
 */
export function FoodPicker({
  withQuantity = false,
  initialGrams = 100,
  suggestions,
  onPick,
  onClose,
  autoFocus = true,
}: FoodPickerProps) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<PickedFood | null>(null);
  // Grams to seed the quantity step with (from the picked food or a suggestion).
  const [startGrams, setStartGrams] = useState<number>(initialGrams);
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounce the search so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = search.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["food-picker", search],
    queryFn: () =>
      apiFetch<FoodListResponse>(
        `/api/foods?search=${encodeURIComponent(search)}&pageSize=8`,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

  const results = useMemo(() => data?.items ?? [], [data]);
  // Highlighted row, clamped into range (results change length asynchronously).
  const activeIndex = results.length ? Math.min(active, results.length - 1) : 0;

  // Household measures of the selected food, to enter the quantity by unit
  // (e.g. "1 unidade" = 50 g). Fetched only in the quantity step.
  const { data: selectedDetail } = useQuery({
    queryKey: ["food", selected?.id],
    queryFn: () => apiFetch<FoodDetailDto>(`/api/foods/${selected!.id}`),
    enabled: withQuantity && !!selected,
    staleTime: 5 * 60_000,
  });
  const measures = selectedDetail?.measures ?? [];

  function choose(food: PickedFood) {
    if (withQuantity) {
      setSelected(food);
      setStartGrams(initialGrams);
    } else {
      onPick({ food, grams: null, measure: null });
      reset();
    }
  }

  async function chooseSuggestion(s: FoodPickerSuggestion) {
    setLoadingSuggestion(s.foodId);
    try {
      const detail = await apiFetch<FoodDetailDto>(`/api/foods/${s.foodId}`);
      const food: PickedFood = {
        id: detail.id,
        description: detail.description,
        code: detail.code,
        origin: detail.origin,
        energyKcal: detail.energyKcal,
        protein: detail.protein,
        carbohydrate: detail.carbohydrate,
        fat: detail.fat,
      };
      if (withQuantity) {
        setSelected(food);
        setStartGrams(Math.round(s.grams) || initialGrams);
      } else {
        onPick({ food, grams: null, measure: null });
        reset();
      }
    } finally {
      setLoadingSuggestion(null);
    }
  }

  function reset() {
    setQuery("");
    setSearch("");
    setSelected(null);
    setStartGrams(initialGrams);
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (selected) setSelected(null);
      else onClose?.();
      return;
    }
    if (selected) return;
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
      if (item) choose(toPicked(item));
    }
  }

  // Quantity step ----------------------------------------------------------
  if (selected) {
    return (
      <QuantityEditor
        key={selected.id}
        food={selected}
        measures={measures}
        initialGrams={startGrams}
        confirmLabel="Adicionar"
        onBack={() => setSelected(null)}
        onConfirm={({ grams, measure }) => {
          onPick({ food: selected, grams, measure });
          reset();
        }}
      />
    );
  }

  // Search step ------------------------------------------------------------
  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
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
          placeholder="Buscar alimento (ex: arroz, frango…)"
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

      {suggestions && suggestions.length > 0 && !enabled && (
        <div className="mt-3">
          <div className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Sugestões do catálogo
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.foodId}
                type="button"
                onClick={() => chooseSuggestion(s)}
                disabled={loadingSuggestion !== null}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-light px-2.5 py-1 text-xs font-medium text-[#475569] hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {loadingSuggestion === s.foodId && (
                  <Loader2 className="size-3 animate-spin" />
                )}
                {s.description}
              </button>
            ))}
          </div>
        </div>
      )}

      {enabled && (
        <div className="mt-2 overflow-hidden">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Buscando alimentos…
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum alimento encontrado.
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-[#F5F7FA] overflow-y-auto">
              {results.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(toPicked(f))}
                    className={`flex w-full items-center gap-3 px-2 py-2.5 text-left ${
                      i === activeIndex ? "bg-primary/5" : "bg-white"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {f.description}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {f.groupName}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-primary">
                      {scaled(f.energyKcal, 100)}
                      <span className="ml-0.5 text-eyebrow font-normal text-muted-foreground">
                        kcal
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 px-2 pt-1 text-caption text-muted-foreground">
            valores por 100 g · ↑ ↓ navegar · Enter selecionar
          </div>
        </div>
      )}

      {!enabled && (!suggestions || suggestions.length === 0) && (
        <div className="mt-2 px-2 py-3 text-xs text-muted-foreground">
          Digite ao menos 2 letras para buscar.
        </div>
      )}
    </div>
  );
}
