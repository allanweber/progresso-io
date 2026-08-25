"use client";

import { useState } from "react";

import {
  BASE_SELECTION,
  FoodMeasures,
  type MeasureSelection,
} from "@/components/foods/food-measures";
import {
  formatNutrient,
  type FoodMeasureDto,
  type FoodNutrientDto,
} from "@/lib/foods";

const KIND_LABELS: Record<string, string> = {
  energy: "Energia",
  macro: "Macronutrientes",
  mineral: "Minerais",
  vitamin: "Vitaminas",
  fatty_acid: "Ácidos graxos",
  amino_acid: "Aminoácidos",
  other: "Outros",
};
const KIND_ORDER = [
  "energy",
  "macro",
  "mineral",
  "vitamin",
  "fatty_acid",
  "amino_acid",
  "other",
];

/** Groups a food's nutrients into ordered sections by kind (order preserved). */
function sections(nutrients: FoodNutrientDto[]) {
  const byKind = new Map<string, FoodNutrientDto[]>();
  for (const n of nutrients) {
    if (!byKind.has(n.kind)) byKind.set(n.kind, []);
    byKind.get(n.kind)!.push(n);
  }
  return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
    kind: k,
    label: KIND_LABELS[k] ?? k,
    items: byKind.get(k)!,
  }));
}

/** The subset of a food detail this component renders (coach + admin DTOs fit). */
type CompositionFood = {
  id: string;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  nutrients: FoodNutrientDto[];
  measures: FoodMeasureDto[];
};

/**
 * The composition block of a food detail page (coach + admin): a portion selector
 * (medidas caseiras, defaulting to a virtual 100 g), the macro highlight grid and
 * the full nutrient profile — all rescaled live to the selected portion. TACO
 * ships per-100 g values, so every number here is `per 100 g × grams / 100`.
 *
 * The selected portion is component state, so callers should mount this with a
 * `key={food.id}` to reset the selection when navigating between foods.
 */
export function FoodComposition({
  food,
  measuresApiBase,
  queryKey,
  canManageMeasures,
  afterMacros,
}: {
  food: CompositionFood;
  /** Measures endpoint base, e.g. "/api/foods" or "/api/admin/foods". */
  measuresApiBase: string;
  /** Query key to refresh after a measure add/remove. */
  queryKey: unknown[];
  canManageMeasures: boolean;
  /** Rendered right under the macro grid, before the full profile (e.g. the
   *  substitutes section). */
  afterMacros?: React.ReactNode;
}) {
  const [sel, setSel] = useState<MeasureSelection>(BASE_SELECTION);
  const factor = sel.grams / 100;
  const scale = (v: number | null) => (v === null ? null : v * factor);

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        Composição por {sel.label}
      </p>

      <FoodMeasures
        apiBase={measuresApiBase}
        foodId={food.id}
        measures={food.measures}
        queryKey={queryKey}
        canManage={canManageMeasures}
        selectedId={sel.id}
        onSelect={setSel}
      />

      {/* Macro highlight — rescaled to the selected portion. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ["Energia", scale(food.energyKcal), "kcal"],
            ["Proteína", scale(food.protein), "g"],
            ["Carboidrato", scale(food.carbohydrate), "g"],
            ["Gordura", scale(food.fat), "g"],
            ["Fibra", scale(food.fiber), "g"],
            ["Sódio", scale(food.sodium), "mg"],
          ] as const
        ).map(([label, value, unit]) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="text-xs text-meta">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {formatNutrient(value, unit)}
            </div>
          </div>
        ))}
      </div>

      {afterMacros}

      {/* Full profile — only base foods carry a full TACO profile. */}
      {food.nutrients.length > 0 && (
        <>
          <h2 className="mt-8 font-heading text-lg font-semibold text-foreground">
            Perfil nutricional completo
          </h2>
          <div className="mt-3 space-y-5">
            {sections(food.nutrients).map((sec) => (
              <div
                key={sec.kind}
                className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
              >
                <div className="border-b border-border bg-surface-light px-4 py-2 text-xs font-semibold text-[#475569]">
                  {sec.label}
                </div>
                <dl>
                  {sec.items.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-2.5 text-sm last:border-0"
                    >
                      <dt className="text-[#475569]">{n.label}</dt>
                      <dd className="tabular-nums text-foreground">
                        {formatNutrient(scale(n.value), n.unit, n.isTrace)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
