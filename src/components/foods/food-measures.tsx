"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { FoodMeasureDto } from "@/lib/foods";

/** A selected portion — the virtual 100 g default (`id: "base"`) or a measure. */
export type MeasureSelection = { id: string; grams: number; label: string };

/** The always-present default portion: 100 g, not a database row. */
export const BASE_SELECTION: MeasureSelection = {
  id: "base",
  grams: 100,
  label: "100 g",
};

/**
 * Household-measure (medida caseira) selector + manager for a food, shared by the
 * coach and admin detail pages. It renders the food's portions as selectable
 * chips — a virtual "100 g" default (never a stored row) plus every real measure
 * — and reports the selection up so the page can rescale the composition. The
 * coach adds clinic-scoped measures via `/api/foods`; the admin adds base ones via
 * `/api/admin/foods` (the endpoint and the query key to refresh are the only
 * differences). Only the viewer's own removable measures show a delete control.
 */
export function FoodMeasures({
  apiBase,
  foodId,
  measures,
  queryKey,
  canManage = true,
  selectedId,
  onSelect,
}: {
  apiBase: string;
  foodId: string;
  measures: FoodMeasureDto[];
  queryKey: unknown[];
  /** When false, the add/remove controls are hidden (read-only). */
  canManage?: boolean;
  /** Selected portion id — `"base"` for the 100 g default, else a measure id. */
  selectedId: string;
  /** Called when a portion chip is picked. */
  onSelect: (selection: MeasureSelection) => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [grams, setGrams] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  // The measure pending a delete confirmation (null when the dialog is closed).
  const [pendingRemove, setPendingRemove] = useState<FoodMeasureDto | null>(null);

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

  function confirmRemove() {
    const m = pendingRemove;
    if (!m) return;
    // Falling back to the 100 g default keeps the composition valid.
    if (m.id === selectedId) onSelect(BASE_SELECTION);
    removeMutation.mutate(m.id, { onSettled: () => setPendingRemove(null) });
  }

  const addError =
    addMutation.error instanceof ApiError ? addMutation.error.message : undefined;

  const chipClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      on
        ? "border-primary bg-primary/5 text-primary"
        : "border-border bg-surface-light text-[#475569] hover:border-primary hover:text-primary"
    }`;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          Medida
        </span>
        {canManage && !adding && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-4" />
            Adicionar medida
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect(BASE_SELECTION)}
          className={chipClass(selectedId === "base")}
        >
          100 g
        </button>
        {measures.map((m) => {
          const on = selectedId === m.id;
          return (
            <span key={m.id} className={chipClass(on)}>
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    id: m.id,
                    grams: m.grams,
                    label: `1 ${m.label} (${m.grams} g)`,
                  })
                }
                className="inline-flex items-center gap-1"
              >
                1 {m.label} · {m.grams} g
                {m.isDefault && (
                  <span className="text-eyebrow uppercase tracking-wide opacity-70">
                    padrão
                  </span>
                )}
              </button>
              {canManage && m.removable && (
                <button
                  type="button"
                  onClick={() => setPendingRemove(m)}
                  disabled={removeMutation.isPending}
                  aria-label="Remover medida"
                  title="Remover medida"
                  className="-mr-1 rounded-full p-0.5 transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {adding && (
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-rest">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Nova medida</span>
            <button
              type="button"
              onClick={reset}
              aria-label="Cancelar"
              className="rounded-full p-1 text-meta transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="measure-label"
                className="block text-body-dense font-medium text-foreground"
              >
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
              <label
                htmlFor="measure-grams"
                className="block text-body-dense font-medium text-foreground"
              >
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
            <label className="flex items-center gap-1.5 pb-2 text-body-dense text-[#475569]">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 accent-primary"
              />
              Padrão
            </label>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? "Adicionando…" : "Adicionar medida"}
            </Button>
          </div>
          {addError && <p className="mt-3 text-body-dense text-destructive">{addError}</p>}
        </div>
      )}

      <Dialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover medida</DialogTitle>
            <DialogDescription>
              Remover a medida{" "}
              <span className="font-medium text-foreground">
                1 {pendingRemove?.label} ({pendingRemove?.grams} g)
              </span>
              ? Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              size="sm"
              onClick={confirmRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
