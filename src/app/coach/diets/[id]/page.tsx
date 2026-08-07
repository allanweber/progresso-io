"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from "lucide-react";

import {
  DietMealsView,
  MacroSummary,
} from "@/components/diets/diet-detail-view";
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
import { DIET_ORIGIN_LABELS, type DietDetailDto } from "@/lib/diets";

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

          <div className="mt-4">
            <DietMealsView meals={data.meals} />
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
