"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from "lucide-react";

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
import { apiFetch } from "@/lib/api-client";
import {
  DIET_ORIGIN_LABELS,
  formatGrams,
  formatKcal,
  type DietDetailDto,
  type DietMacrosDto,
} from "@/lib/diets";

function MacroSummary({
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

export default function DietDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["diet", id],
    queryFn: () => apiFetch<DietDetailDto>(`/api/diets/${id}`),
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/diets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diets"] });
      queryClient.invalidateQueries({ queryKey: ["diet", id] });
      setArchiveOpen(false);
      router.refresh();
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/diets/${id}`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diets"] });
      queryClient.invalidateQueries({ queryKey: ["diet", id] });
      router.refresh();
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/diets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar às dietas
      </Link>

      {isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data ? (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold text-foreground">
                  {data.name}
                </h1>
                {data.origin === "base" && (
                  <Badge variant="base" className="font-medium">
                    {DIET_ORIGIN_LABELS.base}
                  </Badge>
                )}
                {data.archived && (
                  <Badge variant="warn" className="font-medium">
                    arquivada
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.meals.length} refeição(ões)
              </p>
            </div>

            {/* Edit / archive only for the clinic's own diets. */}
            {data.origin === "clinic" && (
              <div className="flex flex-wrap gap-2">
                {!data.archived && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/coach/diets/${id}/edit`}>
                      <Pencil className="size-4" />
                      Editar
                    </Link>
                  </Button>
                )}
                {data.archived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unarchiveMutation.mutate()}
                    disabled={unarchiveMutation.isPending}
                  >
                    <ArchiveRestore className="size-4" />
                    {unarchiveMutation.isPending ? "Restaurando…" : "Desarquivar"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setArchiveOpen(true)}
                  >
                    <Archive className="size-4" />
                    Arquivar
                  </Button>
                )}
              </div>
            )}
          </div>

          {data.notes && (
            <p className="mt-4 rounded-xl border border-border bg-white p-4 text-sm text-[#475569] shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              {data.notes}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-5 py-3 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
            <span className="text-sm font-semibold text-foreground">
              Total da dieta
            </span>
            <MacroSummary totals={data.totals} className="justify-end" />
          </div>

          <div className="mt-4 space-y-4">
            {data.meals.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
                Esta dieta ainda não tem refeições.
              </div>
            ) : (
              data.meals.map((meal) => (
                <div
                  key={meal.id}
                  className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex items-center gap-2 border-b border-border bg-surface-light px-5 py-3">
                    <span className="font-heading font-semibold text-foreground">
                      {meal.name}
                    </span>
                    {meal.time && (
                      <span className="text-xs text-muted-foreground">
                        {meal.time}
                      </span>
                    )}
                    <MacroSummary
                      totals={meal.totals}
                      className="ml-auto justify-end"
                    />
                  </div>
                  {meal.items.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-muted-foreground">
                      Sem alimentos.
                    </div>
                  ) : (
                    <ul>
                      {meal.items.map((item) => (
                        <li
                          key={item.id}
                          className="border-b border-[#F1F5F9] px-5 py-3 last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 font-medium text-foreground">
                              {item.description}
                            </span>
                            <span className="shrink-0 text-sm text-[#475569]">
                              {item.grams} g
                            </span>
                            <span className="w-20 shrink-0 text-right text-sm text-muted-foreground">
                              {formatKcal(item.macros.energyKcal)} kcal
                            </span>
                          </div>
                          {item.substitutes.length > 0 && (
                            <ul className="mt-1.5 space-y-1 pl-1">
                              {item.substitutes.map((s) => (
                                <li
                                  key={s.id}
                                  className="flex items-center gap-2 text-xs text-[#475569]"
                                >
                                  <span className="text-amber-600">⇄</span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {s.description}
                                  </span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {s.grams} g ·{" "}
                                    {formatKcal(s.macros.energyKcal)} kcal
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>

          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Arquivar dieta</DialogTitle>
                <DialogDescription>
                  A dieta sairá da listagem, mas pode ser restaurada depois. Deseja
                  continuar?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => archiveMutation.mutate()}
                  disabled={archiveMutation.isPending}
                >
                  {archiveMutation.isPending ? "Arquivando…" : "Arquivar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
