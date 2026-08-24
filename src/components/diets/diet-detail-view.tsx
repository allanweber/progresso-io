"use client";

import { Badge } from "@/components/ui/badge";
import {
  DIET_ORIGIN_LABELS,
  formatGrams,
  formatKcal,
  type DietItemDto,
  type DietMacrosDto,
  type DietMealDto,
} from "@/lib/diets";

/** A compact kcal + P/C/G line, reused in the total bar and per-meal footers. */
export function MacroSummary({
  totals,
  className = "",
}: {
  totals: DietMacrosDto;
  className?: string;
}) {
  const cells = [
    { label: "kcal", value: formatKcal(totals.energyKcal), c: "text-primary" },
    { label: "Prot", value: formatGrams(totals.protein), c: "text-blue-600" },
    { label: "Carb", value: formatGrams(totals.carbohydrate), c: "text-red-600" },
    { label: "Gord", value: formatGrams(totals.fat), c: "text-amber-600" },
  ];
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-1 ${className}`}>
      {cells.map((c) => (
        <span key={c.label} className="text-sm">
          <span className={`font-bold ${c.c}`}>{c.value}</span>{" "}
          <span className="text-xs text-muted-foreground">{c.label}</span>
        </span>
      ))}
    </div>
  );
}

/** "1 unidade" + "150 g" when a measure was used, else just "150 g". */
function quantityParts(
  grams: number,
  measureLabel: string | null,
  measureGrams: number | null,
): { main: string; sub: string | null } {
  if (measureLabel && measureGrams && measureGrams > 0) {
    const count = Math.round(grams / measureGrams);
    return { main: `${count} ${measureLabel}`, sub: `${grams} g` };
  }
  return { main: `${grams} g`, sub: null };
}

function ItemRow({ item }: { item: DietItemDto }) {
  const q = quantityParts(item.grams, item.measureLabel, item.measureGrams);
  return (
    <li className="flex items-center gap-3 border-b border-[#F1F5F9] px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{item.description}</span>
          <Badge
            variant={item.origin === "base" ? "base" : "clinic"}
            className="px-1.5 py-0 text-eyebrow font-semibold"
          >
            {item.origin === "base"
              ? DIET_ORIGIN_LABELS.base
              : DIET_ORIGIN_LABELS.clinic}
          </Badge>
        </div>
        {item.substitutes.map((s) => {
          const sq = quantityParts(s.grams, s.measureLabel, s.measureGrams);
          return (
            <div
              key={s.id}
              className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"
            >
              <span className="shrink-0">⇄</span>
              <span className="truncate">
                ≈ {sq.main} {s.description}
              </span>
            </div>
          );
        })}
        {(() => {
          // The food's catalog substitutes, minus the ones already added as an
          // equivalence above (matched by food).
          const added = new Set(item.substitutes.map((s) => s.foodId));
          const catalog = item.foodSubstitutes.filter((s) => !added.has(s.foodId));
          if (catalog.length === 0) return null;
          return (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="text-amber-700">⇄</span>{" "}
              {catalog.map((s) => s.description.split(",")[0]).join(", ")}
            </div>
          );
        })()}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-foreground">{q.main}</div>
        {q.sub && <div className="text-caption text-muted-foreground">{q.sub}</div>}
      </div>
      <div className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {formatKcal(item.macros.energyKcal)} kcal
      </div>
    </li>
  );
}

/**
 * The read-only meals of a diet, styled after the design: each meal is a card
 * (name + time header), each item a row with a tinted food square, the food name
 * + origin tag, its equivalences as amber "⇄ ≈ …" lines, the quantity (in the
 * measure used) and its kcal; a subtle per-meal macro footer closes each card.
 */
export function DietMealsView({ meals }: { meals: DietMealDto[] }) {
  if (meals.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        Esta dieta ainda não tem refeições.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {meals.map((meal) => (
        <div
          key={meal.id}
          className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
        >
          <div className="flex items-center gap-2 border-b border-border bg-surface-light px-4 py-3">
            <span className="font-heading font-semibold text-foreground">
              {meal.name}
            </span>
            {meal.time && (
              <span className="text-xs text-muted-foreground">{meal.time}</span>
            )}
          </div>
          {meal.items.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">
              Sem alimentos.
            </div>
          ) : (
            <ul>
              {meal.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
          )}
          <div className="flex justify-end border-t border-[#F1F5F9] px-4 py-2">
            <MacroSummary totals={meal.totals} className="justify-end" />
          </div>
        </div>
      ))}
    </div>
  );
}
