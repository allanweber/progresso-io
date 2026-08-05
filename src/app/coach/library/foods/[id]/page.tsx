"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import {
  FOOD_TYPE_LABELS,
  ORIGIN_LABELS,
  formatNutrient,
  type FoodDetailDto,
  type FoodNutrientDto,
} from "@/lib/foods";

const KIND_LABELS: Record<string, string> = {
  energy: "Energia",
  macro: "Macronutrientes",
  fatty_acid: "Ácidos graxos",
  mineral: "Minerais",
  vitamin: "Vitaminas",
  other: "Outros",
};
const KIND_ORDER = ["energy", "macro", "fatty_acid", "mineral", "vitamin", "other"];

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

export default function FoodDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["food", id],
    queryFn: () => apiFetch<FoodDetailDto>(`/api/foods/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Bibliotecas
      </Link>

      {isLoading ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  data.origin === "base"
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "bg-[#ECFDF5] text-[#047857]"
                }`}
              >
                {ORIGIN_LABELS[data.origin]}
              </span>
              <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#475569]">
                {FOOD_TYPE_LABELS[data.type]}
              </span>
              <span className="text-xs text-[#94A3B8]">{data.groupName}</span>
              {data.code && (
                <span className="text-xs text-[#94A3B8]">· {data.code}</span>
              )}
            </div>
            <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
              {data.description}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Composição por 100 g
            </p>
          </div>

          {/* Macro highlight */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Energia", data.energyKcal, "kcal"],
              ["Proteína", data.protein, "g"],
              ["Carboidrato", data.carbohydrate, "g"],
              ["Gordura", data.fat, "g"],
              ["Fibra", data.fiber, "g"],
              ["Sódio", data.sodium, "mg"],
            ].map(([label, value, unit]) => (
              <div
                key={label as string}
                className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
              >
                <div className="text-xs text-[#94A3B8]">{label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {formatNutrient(value as number | null, unit as string)}
                </div>
              </div>
            ))}
          </div>

          {/* Full profile */}
          <h2 className="mt-8 font-heading text-lg font-semibold text-foreground">
            Perfil nutricional completo
          </h2>
          <div className="mt-3 space-y-5">
            {sections(data.nutrients).map((sec) => (
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
                        {formatNutrient(n.value, n.unit, n.isTrace)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          {/* Substitutes (read-only in phase 1) */}
          <h2 className="mt-8 font-heading text-lg font-semibold text-foreground">
            Substitutos
          </h2>
          {data.substitutes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum substituto cadastrado para este alimento.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.substitutes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
                >
                  <Link
                    href={`/coach/library/foods/${s.foodId}`}
                    className="min-w-0 truncate font-medium text-foreground hover:text-primary"
                  >
                    {s.description}
                  </Link>
                  <span className="shrink-0 text-sm text-[#475569]">
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNutrient(s.grams, "g")}
                    </span>{" "}
                    ≡ 100 g
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
