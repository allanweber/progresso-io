"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Pencil, Trash2 } from "lucide-react";

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
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_QUESTION_TYPE_LABELS,
  countQuestions,
  type AnamnesisDetailDto,
} from "@/lib/anamneses";

export default function AnamnesisDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["anamnesis", id],
    queryFn: () => apiFetch<AnamnesisDetailDto>(`/api/anamneses/${id}`),
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/anamneses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      setDeleteOpen(false);
      router.push("/coach/anamneses");
      router.refresh();
    },
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ anamnesis: { id: string } }>(`/api/anamneses/${id}/copy`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      router.push(`/coach/anamneses/${res.anamnesis.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/anamneses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar às anamneses
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
                <Badge variant="base" className="font-medium">
                  {ANAMNESIS_OBJECTIVE_LABELS[data.objective]}
                </Badge>
                <Badge variant="neutral" className="font-medium">
                  {ANAMNESIS_MODALITY_LABELS[data.modality]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.sections.length} seção(ões) · {countQuestions(data.sections)}{" "}
                pergunta(s)
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyMutation.mutate()}
                disabled={copyMutation.isPending}
              >
                <Copy className="size-4" />
                {copyMutation.isPending ? "Duplicando…" : "Duplicar"}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/coach/anamneses/${id}/edit`}>
                  <Pencil className="size-4" />
                  Editar
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
                Excluir
              </Button>
            </div>
          </div>

          {data.description && (
            <p className="mt-4 rounded-xl border border-border bg-white p-4 text-sm text-[#475569] shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              {data.description}
            </p>
          )}

          <div className="mt-4 space-y-4">
            {data.sections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">
                Esta anamnese ainda não tem seções. Use “Editar” para montá-la.
              </div>
            ) : (
              data.sections.map((section) => (
                <div
                  key={section.key}
                  className="rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
                >
                  <h2 className="border-b border-border px-5 py-3 font-heading text-base font-semibold text-foreground">
                    {section.title}
                  </h2>
                  {section.questions.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-muted-foreground">
                      Sem perguntas nesta seção.
                    </p>
                  ) : (
                    <ol className="divide-y divide-[#F1F5F9]">
                      {section.questions.map((q, i) => (
                        <li
                          key={q.key}
                          className="flex items-start justify-between gap-3 px-5 py-3"
                        >
                          <span className="flex min-w-0 gap-2 text-sm text-foreground">
                            <span className="shrink-0 text-muted-foreground">
                              {i + 1}.
                            </span>
                            <span className="min-w-0">{q.label}</span>
                          </span>
                          <Badge variant="neutral" className="shrink-0 font-medium">
                            {ANAMNESIS_QUESTION_TYPE_LABELS[q.type]}
                          </Badge>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))
            )}
          </div>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir anamnese</DialogTitle>
                <DialogDescription>
                  A anamnese “{data.name}” será excluída permanentemente. Esta ação
                  não pode ser desfeita. Deseja continuar?
                </DialogDescription>
              </DialogHeader>
              {deleteMutation.isError && (
                <p className="text-body-dense font-medium text-destructive">
                  {(deleteMutation.error as Error).message}
                </p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Excluindo…" : "Excluir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
