"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { FoodMeasureDto } from "@/lib/foods";

/**
 * Household-measure (medida caseira) manager for a food, shared by the coach and
 * admin detail pages (reused in two places, so it earns its own component). The
 * coach adds clinic-scoped measures via `/api/foods`; the admin adds base ones
 * via `/api/admin/foods` — the endpoint and the query key to refresh are the only
 * differences, passed in. Lists base + own measures; only removable ones (the
 * viewer's own) show a delete control.
 */
export function FoodMeasures({
  apiBase,
  foodId,
  measures,
  queryKey,
  canManage = true,
}: {
  apiBase: string;
  foodId: string;
  measures: FoodMeasureDto[];
  queryKey: unknown[];
  /** When false, the section is read-only (no add/remove controls). */
  canManage?: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [grams, setGrams] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  function reset() {
    setAdding(false);
    setLabel("");
    setGrams("");
    setIsDefault(false);
  }

  const addMutation = useMutation({
    mutationFn: (body: { label: string; grams: number; isDefault: boolean }) =>
      apiFetch(`${apiBase}/${foodId}/measures`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      reset();
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (measureId: string) =>
      apiFetch(`${apiBase}/${foodId}/measures/${measureId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  function submit() {
    const g = Number(grams.replace(",", "."));
    if (!label.trim() || !Number.isFinite(g) || g <= 0) return;
    addMutation.mutate({ label: label.trim(), grams: g, isDefault });
  }

  const addError =
    addMutation.error instanceof ApiError ? addMutation.error.message : undefined;

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Medidas caseiras
        </h2>
        {canManage && !adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" />
            Adicionar
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Nova medida</span>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancelar"
              className="rounded-full p-1 text-[#94A3B8] transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="measure-label" className="block text-[13px] font-medium text-foreground">
                Medida
              </label>
              <Input
                id="measure-label"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="ex.: unidade, fatia"
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="measure-grams" className="block text-[13px] font-medium text-foreground">
                Gramas
              </label>
              <Input
                id="measure-grams"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                placeholder="ex.: 50"
                className="w-28"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[13px] text-[#475569]">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 accent-primary"
              />
              Padrão
            </label>
            <Button type="button" size="sm" onClick={submit} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adicionando…" : "Adicionar medida"}
            </Button>
          </div>
          {addError && <p className="mt-3 text-[13px] text-destructive">{addError}</p>}
        </div>
      )}

      {measures.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma medida caseira cadastrada. Sem medidas, o alimento é usado em
          gramas.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {measures.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">1 {m.label}</span>
                {m.isDefault && (
                  <Badge variant="neutral" className="font-medium">
                    padrão
                  </Badge>
                )}
                {m.origin === "clinic" && (
                  <Badge variant="clinic" className="font-medium">
                    própria
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm text-[#475569]">
                  <span className="font-semibold tabular-nums text-foreground">
                    {m.grams}
                  </span>{" "}
                  g
                </span>
                {canManage && m.removable && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(m.id)}
                    disabled={removeMutation.isPending}
                    aria-label="Remover medida"
                    title="Remover medida"
                    className="rounded-full p-1 text-[#94A3B8] transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
