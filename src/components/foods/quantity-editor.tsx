"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";

import type { PickedFood } from "@/components/foods/food-picker";
import type { FoodMeasureDto } from "@/lib/foods";

/** A measure snapshot (label + grams per one unit), or null for plain grams. */
export type PickedMeasure = { label: string; grams: number } | null;

/** The result of confirming: the total grams and the measure used (if any). */
export type QuantityResult = { grams: number; measure: PickedMeasure };

/** Scales a per-100 g value by grams, formatted pt-BR ("—" when unknown). */
function scaled(value: number | null, grams: number, decimals = 0): string {
  if (value === null || value === undefined) return "—";
  const n = (value * grams) / 100;
  return (decimals === 0 ? Math.round(n) : Number(n.toFixed(decimals)))
    .toString()
    .replace(".", ",");
}

/**
 * Quantity + unit editor for a food: enter the amount in grams or in one of the
 * food's household measures (medidas caseiras), with a live macro preview. Shared
 * by the {@link FoodPicker} (adding a food) and the diet builder (editing an
 * existing item) so the two stay identical. The confirmed value is always grams;
 * `measure` carries the chosen unit so callers can display "2 fatias" later.
 *
 * The selected unit and amount are seeded from `initialMeasure` + `initialGrams`
 * at mount, so mount this fresh (a new `key`) when the target food changes.
 */
export function QuantityEditor({
  food,
  measures,
  initialGrams,
  initialMeasure = null,
  confirmLabel = "Adicionar",
  backLabel = "Voltar aos resultados",
  onConfirm,
  onBack,
}: {
  food: PickedFood;
  measures: FoodMeasureDto[];
  initialGrams: number;
  /** Preselect this measure unit (matched by label + grams) when present. */
  initialMeasure?: PickedMeasure;
  confirmLabel?: string;
  /** Label for the back/cancel control (defaults to the picker's wording). */
  backLabel?: string;
  onConfirm: (result: QuantityResult) => void;
  /** Optional back/cancel control. */
  onBack?: () => void;
}) {
  const matched = initialMeasure
    ? measures.find(
        (m) => m.label === initialMeasure.label && m.grams === initialMeasure.grams,
      )
    : undefined;
  const [unit, setUnit] = useState<string>(matched ? matched.id : "g");
  const [amount, setAmount] = useState<number | "">(
    matched ? Math.max(1, Math.round(initialGrams / matched.grams) || 1) : initialGrams,
  );

  const activeMeasure = measures.find((m) => m.id === unit) ?? null;
  const g = activeMeasure ? (Number(amount) || 0) * activeMeasure.grams : Number(amount) || 0;
  const step = activeMeasure ? 1 : 10;

  // Switch the entry unit, converting the current grams to the new unit so the
  // quantity carries over (e.g. 50 g ↔ 2 fatias) instead of resetting.
  const selectUnit = (next: string) => {
    const current = g;
    const m = measures.find((x) => x.id === next);
    setUnit(next);
    setAmount(m ? Math.max(1, Math.round(current / m.grams) || 1) : Math.round(current));
  };

  const confirm = () => {
    if (g <= 0) return;
    onConfirm({
      grams: g,
      measure: activeMeasure
        ? { label: activeMeasure.label, grams: activeMeasure.grams }
        : null,
    });
  };

  const macros: { label: string; value: string; className: string }[] = [
    { label: "kcal", value: scaled(food.energyKcal, g), className: "text-primary" },
    { label: "Prot", value: scaled(food.protein, g, 1), className: "text-blue-600" },
    { label: "Carb", value: scaled(food.carbohydrate, g, 1), className: "text-red-600" },
    { label: "Gord", value: scaled(food.fat, g, 1), className: "text-amber-600" },
  ];

  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1 text-body-dense font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          {backLabel}
        </button>
      )}
      <div className="font-semibold text-foreground">{food.description}</div>
      <div className="mb-3 text-xs text-muted-foreground">
        Defina a quantidade
        {activeMeasure ? ` em ${activeMeasure.label}` : " em gramas"}
      </div>

      {measures.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-caption font-medium text-muted-foreground">
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
            autoFocus
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
          equivale a <span className="font-semibold text-foreground">{g} g</span>{" "}
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
            <div className="mt-0.5 text-eyebrow font-semibold uppercase tracking-wide text-muted-foreground">
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
        {confirmLabel}
      </button>
    </div>
  );
}
