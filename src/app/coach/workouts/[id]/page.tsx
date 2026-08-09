"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Copy, Pencil } from "lucide-react";

import {
  WorkoutExerciseDetail,
  WorkoutSessionsView,
  type GroupInfo,
} from "@/components/workouts/workout-detail-view";
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
  WORKOUT_ORIGIN_LABELS,
  type WorkoutDetailDto,
  type WorkoutExerciseDto,
} from "@/lib/workouts";

export default function WorkoutDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [detail, setDetail] = useState<{
    exercise: WorkoutExerciseDto;
    group: GroupInfo | null;
  } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["workout", id],
    queryFn: () => apiFetch<WorkoutDetailDto>(`/api/workouts/${id}`),
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/workouts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      queryClient.invalidateQueries({ queryKey: ["workout", id] });
      setArchiveOpen(false);
      router.refresh();
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => apiFetch(`/api/workouts/${id}`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      queryClient.invalidateQueries({ queryKey: ["workout", id] });
      router.refresh();
    },
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ workout: { id: string } }>(`/api/workouts/${id}/copy`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      router.push(`/coach/workouts/${res.workout.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/workouts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar aos treinos
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
                    {WORKOUT_ORIGIN_LABELS.base}
                  </Badge>
                )}
                {data.archived && (
                  <Badge variant="warn" className="font-medium">
                    arquivado
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.sessions.length} ficha(s)
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
                {copyMutation.isPending ? "Copiando…" : "Criar cópia"}
              </Button>

              {data.origin === "clinic" && !data.archived && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/coach/workouts/${id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </Button>
              )}
              {data.origin === "clinic" &&
                (data.archived ? (
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
                ))}
            </div>
          </div>

          {data.notes && (
            <p className="mt-4 rounded-xl border border-border bg-white p-4 text-sm text-[#475569] shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              {data.notes}
            </p>
          )}

          <div className="mt-4">
            <WorkoutSessionsView
              sessions={data.sessions}
              onExerciseClick={(exercise, group) => setDetail({ exercise, group })}
            />
          </div>

          <WorkoutExerciseDetail
            exercise={detail?.exercise ?? null}
            group={detail?.group ?? null}
            onClose={() => setDetail(null)}
          />

          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Arquivar treino</DialogTitle>
                <DialogDescription>
                  O treino sairá da listagem, mas pode ser restaurado depois. Deseja
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
