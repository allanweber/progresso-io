"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { FoodComposition } from "@/components/foods/food-composition";
import { Badge } from "@/components/ui/badge";
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
import type { AdminFoodDetailDto, AdminFoodListResponse } from "@/lib/admin";
import { FOOD_TYPE_LABELS, formatNutrient } from "@/lib/foods";

export default function AdminFoodDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-food", id],
    queryFn: () => apiFetch<AdminFoodDetailDto>(`/api/admin/foods/${id}`),
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/admin/foods/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-foods"] });
      router.push("/admin/foods");
      router.refresh();
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/admin/foods/${id}`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-foods"] });
      queryClient.invalidateQueries({ queryKey: ["admin-food", id] });
      router.refresh();
    },
  });

  const isBase = data?.origin === "base";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/foods"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Catálogo
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
              <Badge
                variant={isBase ? "base" : "clinic"}
                className="font-medium"
              >
                {isBase ? "base" : (data.clinicName ?? "clínica")}
              </Badge>
              <Badge variant="neutral" className="font-medium">
                {FOOD_TYPE_LABELS[data.type]}
              </Badge>
              <span className="text-xs text-[#94A3B8]">{data.groupName}</span>
              {data.code && (
                <span className="text-xs text-[#94A3B8]">· {data.code}</span>
              )}
              {data.archived && (
                <Badge variant="neutral" className="font-medium">
                  arquivado
                </Badge>
              )}
            </div>

            <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
              {data.description}
            </h1>

            {/* Base foods are admin-editable; clinic foods are view-only. */}
            {isBase ? (
              data.archived ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => unarchiveMutation.mutate()}
                    disabled={unarchiveMutation.isPending}
                  >
                    <ArchiveRestore className="size-4" />
                    {unarchiveMutation.isPending ? "Restaurando…" : "Desarquivar"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/foods/${data.id}/edit`}>
                      <Pencil className="size-4" />
                      Editar
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setArchiveOpen(true)}
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="size-4" />
                    {archiveMutation.isPending ? "Arquivando…" : "Arquivar"}
                  </Button>
                </div>
              )
            ) : (
              <div className="mt-4 rounded-xl border border-border bg-surface-light px-4 py-2.5 text-[13px] text-muted-foreground">
                Alimento próprio da clínica{" "}
                <span className="font-medium text-foreground">
                  {data.clinicName}
                </span>{" "}
                — somente leitura.
              </div>
            )}
          </div>

          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Arquivar alimento base</DialogTitle>
                <DialogDescription>
                  Arquivar{" "}
                  <span className="font-medium text-foreground">
                    {data.description}
                  </span>
                  ? Ele deixa de aparecer nas bibliotecas, mas o histórico é
                  mantido.
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
                  onClick={() => {
                    setArchiveOpen(false);
                    archiveMutation.mutate();
                  }}
                  disabled={archiveMutation.isPending}
                >
                  Arquivar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Portion selector + macros + full profile (rescales live). The key
              resets the selected portion when navigating between foods. */}
          <FoodComposition
            key={data.id}
            food={data}
            measuresApiBase="/api/admin/foods"
            queryKey={["admin-food", id]}
            canManageMeasures={isBase}
          />

          {/* Base substitutes — admin-managed on base foods. */}
          <BaseSubstitutes food={data} canManage={isBase} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The base-substitutes section of the admin detail page: the shared (base)
 * substitution rules for the food, with add/remove when the food itself is a
 * base food. Inline (used only here) per the "no single-use components" rule.
 */
function BaseSubstitutes({
  food,
  canManage,
}: {
  food: AdminFoodDetailDto;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; description: string } | null>(
    null,
  );
  const [grams, setGrams] = useState("100");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-food", food.id] });

  const addMutation = useMutation({
    mutationFn: (body: { substituteFoodId: string; grams: number }) =>
      apiFetch(`/api/admin/foods/${food.id}/substitutions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      resetPicker();
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (subId: string) =>
      apiFetch(`/api/admin/foods/${food.id}/substitutions/${subId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  function resetPicker() {
    setAdding(false);
    setSearchInput("");
    setSearch("");
    setPicked(null);
    setGrams("100");
  }

  const existingIds = useMemo(
    () => new Set([food.id, ...food.substitutes.map((s) => s.foodId)]),
    [food],
  );

  const { data: results, isFetching } = useQuery({
    queryKey: ["admin-food-sub-search", search],
    queryFn: () =>
      apiFetch<AdminFoodListResponse>(
        `/api/admin/foods?search=${encodeURIComponent(search)}&pageSize=8`,
      ),
    enabled: adding && search.length >= 2 && !picked,
  });

  const options = (results?.items ?? []).filter((f) => !existingIds.has(f.id));

  function submitAdd() {
    if (!picked) return;
    const g = Number(grams.replace(",", "."));
    if (!Number.isFinite(g) || g <= 0) return;
    addMutation.mutate({ substituteFoodId: picked.id, grams: g });
  }

  const addError =
    addMutation.error instanceof ApiError ? addMutation.error.message : undefined;

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Substitutos base
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
            <span className="text-sm font-medium text-foreground">
              Novo substituto base
            </span>
            <button
              type="button"
              onClick={resetPicker}
              aria-label="Cancelar"
              className="rounded-full p-1 text-[#94A3B8] transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {picked ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-light px-3 py-2">
                <span className="min-w-0 break-words text-sm font-medium text-foreground">
                  {picked.description}
                </span>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  Trocar
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="sub-grams"
                    className="block text-[13px] font-medium text-foreground"
                  >
                    Gramas ≡ 100 g de {food.description.split(",")[0]}
                  </label>
                  <Input
                    id="sub-grams"
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={submitAdd}
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending ? "Adicionando…" : "Adicionar substituto"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
                <Input
                  type="search"
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar alimento substituto…"
                  className="pl-9"
                />
              </div>
              {search.length >= 2 && (
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border">
                  {isFetching && options.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted-foreground">
                      Buscando…
                    </li>
                  ) : options.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted-foreground">
                      Nenhum alimento encontrado.
                    </li>
                  ) : (
                    options.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setPicked({ id: f.id, description: f.description })
                          }
                          className="flex w-full items-center justify-between gap-2 border-b border-[#F1F5F9] px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-surface-light"
                        >
                          <span className="min-w-0 break-words text-foreground">
                            {f.description}
                          </span>
                          <span className="shrink-0 text-xs text-[#94A3B8]">
                            {f.origin === "base" ? "base" : (f.clinicName ?? "clínica")}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}

          {addError && (
            <p className="mt-3 text-[13px] text-destructive">{addError}</p>
          )}
        </div>
      )}

      {food.substitutes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhum substituto base cadastrado para este alimento.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {food.substitutes.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
            >
              <Link
                href={`/admin/foods/${s.foodId}`}
                className="min-w-0 break-words font-medium text-foreground hover:text-primary"
              >
                {s.description}
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm text-[#475569]">
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatNutrient(s.grams, "g")}
                  </span>{" "}
                  ≡ 100 g
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(s.id)}
                    disabled={removeMutation.isPending}
                    aria-label="Remover substituto"
                    title="Remover substituto"
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
