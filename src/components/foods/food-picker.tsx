"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Plus, Search, X } from "lucide-react";

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
  /** Emitted when the coach confirms a food (grams is null when !withQuantity). */
  onPick: (picked: { food: PickedFood; grams: number | null }) => void;
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
  // Quantity entry unit: "g" (grams) or a measure id. When a measure is the
  // unit, `amount` counts that measure and the grams are derived (count × grams
  // per measure) — selecting a measure sets the quantity in that unit, it does
  // not sum grams.
  const [unit, setUnit] = useState<string>("g");
  const [amount, setAmount] = useState<number | "">(initialGrams);
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
      setUnit("g");
      setAmount(initialGrams);
    } else {
      onPick({ food, grams: null });
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
        setUnit("g");
        setAmount(Math.round(s.grams) || initialGrams);
      } else {
        onPick({ food, grams: null });
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
    setUnit("g");
    setAmount(initialGrams);
    setActive(0);
  }

  /** Grams for the current unit + amount (count × grams/measure, or grams). */
  function gramsFor(u: string, a: number | ""): number {
    const n = Number(a) || 0;
    const m = measures.find((x) => x.id === u);
    return m ? n * m.grams : n;
  }

  function confirm() {
    const g = gramsFor(unit, amount);
    if (!selected || g <= 0) return;
    onPick({ food: selected, grams: g });
    reset();
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
    const activeMeasure = measures.find((m) => m.id === unit) ?? null;
    const g = gramsFor(unit, amount);
    const step = activeMeasure ? 1 : 10;
    // Switch the entry unit, converting the current grams to the new unit so
    // the quantity carries over (e.g. 50 g ↔ 2 fatias) instead of resetting.
    const selectUnit = (next: string) => {
      const current = g;
      const m = measures.find((x) => x.id === next);
      setUnit(next);
      setAmount(m ? Math.max(1, Math.round(current / m.grams) || 1) : Math.round(current));
    };
    const macros: { label: string; value: string; className: string }[] = [
      {
        label: "kcal",
        value: scaled(selected.energyKcal, g),
        className: "text-primary",
      },
      { label: "Prot", value: scaled(selected.protein, g, 1), className: "text-blue-600" },
      {
        label: "Carb",
        value: scaled(selected.carbohydrate, g, 1),
        className: "text-red-600",
      },
      { label: "Gord", value: scaled(selected.fat, g, 1), className: "text-amber-600" },
    ];
    return (
      <div className="rounded-xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Voltar aos resultados
        </button>
        <div className="font-semibold text-foreground">{selected.description}</div>
        <div className="mb-3 text-xs text-muted-foreground">
          Defina a quantidade
          {activeMeasure ? ` em ${activeMeasure.label}` : " em gramas"}
        </div>

        {measures.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              Unidade
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => selectUnit("g")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  !activeMeasure
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-surface-light text-[#475569] hover:border-primary hover:text-primary"
                }`}
              >
                gramas
              </button>
              {measures.map((m) => {
                const on = unit === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectUnit(m.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-surface-light text-[#475569] hover:border-primary hover:text-primary"
                    }`}
                  >
                    {m.label} · {m.grams} g
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-2 flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => setAmount((v) => Math.max(0, (Number(v) || 0) - step))}
            className="w-11 shrink-0 rounded-lg border border-border bg-white text-lg font-semibold text-[#334155] hover:border-primary"
            aria-label="Diminuir"
          >
            −
          </button>
          <div className="relative flex flex-1 items-center rounded-lg border border-primary ring-2 ring-primary/15">
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                setAmount(v === "" ? "" : parseInt(v, 10));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              className="w-full bg-transparent px-3 py-2 text-center text-lg font-bold text-foreground outline-none"
            />
            <span className="absolute right-3 text-xs font-semibold text-muted-foreground">
              {activeMeasure ? activeMeasure.label : "g"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAmount((v) => (Number(v) || 0) + step)}
            className="w-11 shrink-0 rounded-lg border border-border bg-white text-lg font-semibold text-[#334155] hover:border-primary"
            aria-label="Aumentar"
          >
            +
          </button>
        </div>

        {activeMeasure && (
          <div className="mb-3 text-center text-xs text-muted-foreground">
            equivale a{" "}
            <span className="font-semibold text-foreground">{g} g</span>{" "}
            <span className="text-[#94A3B8]">
              (1 {activeMeasure.label} = {activeMeasure.grams} g)
            </span>
          </div>
        )}

        <div className="mb-3 grid grid-cols-4 gap-2">
          {macros.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-[#EEF2F6] bg-surface-light p-2 text-center"
            >
              <div className={`text-base font-bold ${m.className}`}>{m.value}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={confirm}
          disabled={g <= 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted-foreground"
        >
          <Plus className="size-4" />
          Adicionar
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
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                      <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                        kcal
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 px-2 pt-1 text-[11px] text-muted-foreground">
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
