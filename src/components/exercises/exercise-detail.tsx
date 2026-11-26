"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Dumbbell,
  Languages,
  Pencil,
  PersonStanding,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { ExerciseMedia, ExerciseThumb } from "@/components/exercises/exercise-media";
import { ExerciseMuscleMap } from "@/components/exercises/exercise-muscle-map";
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
import {
  BODY_PART_LABELS,
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  MACHINE_KIND_LABELS,
  NEED_LABELS,
  ORIGIN_LABELS,
  TARGET_LABELS,
  muscleShares,
  type ExerciseDetailDto,
  type ExerciseEquipment,
} from "@/lib/exercises";
import { cn } from "@/lib/utils";

const TAG =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-foreground";

type Detail = ExerciseDetailDto & { clinicName?: string | null };

type ManageMode = "base" | "clinic";

export function ExerciseDetail({
  apiBase,
  backHref,
  manage,
}: {
    apiBase: string;
    backHref: string;
    manage?: ManageMode;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [english, setEnglish] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [apiBase, id],
    queryFn: () => apiFetch<Detail>(`${apiBase}/${id}`),
    retry: false,
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiFetch(`${apiBase}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      router.push(backHref);
      router.refresh();
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => apiFetch(`${apiBase}/${id}`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      queryClient.invalidateQueries({ queryKey: [apiBase, id] });
      router.refresh();
    },
  });

  const canEdit =
    !!data &&
    !data.archived &&
    ((manage === "clinic" && data.origin === "clinic") ||
      (manage === "base" && data.origin === "base"));
  const canArchive =
    !!data &&
    !data.archived &&
    (manage === "clinic" ? data.origin === "clinic" : manage === "base");
  const canUnarchive = !!data && data.archived && manage === "base";

  const shares = data
    ? muscleShares(data.mapPrimary, data.mapSecondary, data.muscleWeights)
    : [];
  const shownShares = shares.length > 3 ? shares.slice(0, 2) : shares;
  const restShares = shares.slice(shownShares.length);
  const restPercent = restShares.reduce((sum, m) => sum + m.percent, 0);
  const steps = data ? (english && data.instructionsEn.length ? data.instructionsEn : data.instructions) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar aos exercícios
      </Link>

      {isLoading ? (
        <div className="mt-4 rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando exercício…
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-2xl bg-card p-10 text-center text-sm text-destructive shadow-rest">
          {(error as Error).message}
        </div>
      ) : data ? (
        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {data.name}
            </h1>
            {data.origin === "clinic" && (
              <Badge variant="clinic" className="font-medium">
                {ORIGIN_LABELS.clinic}
              </Badge>
            )}
          </div>
          {data.nameEn && (
            <p lang="en" className="mt-1 text-sm text-muted-foreground">
              {data.nameEn}
            </p>
          )}
          {data.clinicName && (
            <p className="mt-1 text-sm text-muted-foreground">{data.clinicName}</p>
          )}
          {data.archived && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="neutral" className="font-medium">
                arquivado
              </Badge>
              {canUnarchive && (
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
              )}
            </div>
          )}

          {(canEdit || canArchive) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canEdit && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${backHref}/${data.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </Button>
              )}
              {canArchive && (
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
              )}
            </div>
          )}

          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Arquivar exercício</DialogTitle>
                <DialogDescription>
                  Arquivar{" "}
                  <span className="font-medium text-foreground">{data.name}</span>?
                  Ele deixa de aparecer no catálogo, mas o histórico é mantido.
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

          <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
            <ExerciseMedia
              key={data.id}
              media={data}
              name={data.name}
              mapPrimary={data.mapPrimary}
              mapSecondary={data.mapSecondary}
              className="w-full max-w-[360px] justify-self-center md:justify-self-start"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2" data-testid="exercise-tags">
                <span className={TAG}>
                  <Dumbbell className="size-3.5" aria-hidden />
                  {EQUIPMENT_LABELS[data.equipment]}
                </span>
                <span className={cn(TAG, "bg-primary-light text-primary")}>
                  {BODY_PART_LABELS[data.bodyPart]}
                </span>
                {shownShares.map((m) => (
                  <span key={m.muscle} className={TAG}>
                    {m.primary && <PersonStanding className="size-3.5" aria-hidden />}
                    {m.label} {m.percent}%
                  </span>
                ))}
                {restShares.length > 0 &&
                  (showOther ? (
                    <>
                      {restShares.map((m) => (
                        <span key={m.muscle} className={cn(TAG, "text-muted-foreground")}>
                          {m.label} {m.percent}%
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowOther(false)}
                        aria-label="Fechar"
                        className={TAG}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowOther(true)} className={TAG}>
                      Outros {restPercent}%
                    </button>
                  ))}
                {data.machineKind && data.machineKind !== "none" && (
                  <span className={TAG}>{MACHINE_KIND_LABELS[data.machineKind]}</span>
                )}
                {data.needs.map((n) => (
                  <span key={n} className={TAG}>
                    Precisa de {NEED_LABELS[n].toLowerCase()}
                  </span>
                ))}
                {data.hold && <span className={TAG}>Por tempo</span>}
                {data.track === "distance" && <span className={TAG}>Por distância</span>}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {CATEGORY_LABELS[data.category]} · Músculo principal:{" "}
                <span className="text-foreground">{TARGET_LABELS[data.target]}</span>
              </p>

              {(english ? data.descriptionEn : data.description) && (
                <p className="mt-4 rounded-2xl bg-surface-light p-4 text-sm leading-relaxed text-foreground">
                  {english ? data.descriptionEn : data.description}
                </p>
              )}

              {data.mapPrimary.length > 0 && (data.image || data.video) && (
                <div className="mt-4 flex items-center gap-4">
                  <ExerciseMuscleMap
                    primary={data.mapPrimary}
                    secondary={data.mapSecondary}
                    both
                    className="h-40 w-48 rounded-2xl"
                  />
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full bg-primary" aria-hidden />
                      Músculo principal
                    </span>
                    {data.mapSecondary.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-primary/35" aria-hidden />
                        Músculo secundário
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {steps.length > 0 && (
            <section className="mt-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-lg font-bold text-foreground">Como fazer</h2>
                {data.instructionsEn.length > 0 && data.instructions.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={english}
                    onClick={() => setEnglish((v) => !v)}
                  >
                    <Languages className="size-4" />
                    {english ? "Ver em português" : "Ver em inglês"}
                  </Button>
                )}
              </div>
              <ol className="mt-3 space-y-3" lang={english ? "en" : "pt-BR"}>
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-body-dense font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-foreground">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {manage === "clinic" || (manage === "base" && data.origin === "base") ? (
            <SubstitutionsManager
              mode={manage}
              exercise={data}
              apiBase={apiBase}
              backHref={backHref}
            />
          ) : (
            data.substitutes.length > 0 && (
              <div className="mt-6">
                <h2 className="font-heading text-lg font-bold text-foreground">
                  Substituições
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Exercícios que treinam o mesmo músculo e podem entrar no lugar
                  deste.
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.substitutes.map((s) => {
                    return (
                      <li key={s.id}>
                        <Link
                          href={`${backHref}/${s.exerciseId}`}
                          className="group flex items-center gap-3 rounded-2xl bg-card p-3 shadow-rest transition-colors hover:border-primary"
                        >
                          <ExerciseThumb image={s.image} className="size-14 rounded-xl" />
                          <div className="min-w-0">
                            <div className="break-words text-sm font-medium text-foreground">
                              {s.name}
                            </div>
                            <div className="mt-0.5 text-xs text-meta">
                              {EQUIPMENT_LABELS[s.equipment]}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}

        </article>
      ) : null}
    </div>
  );
}

type PickerResponse = {
  items: { id: string; name: string; equipment: ExerciseEquipment }[];
};

function SubstitutionsManager({
  mode,
  exercise,
  apiBase,
  backHref,
}: {
  mode: ManageMode;
  exercise: Detail;
  apiBase: string;
  backHref: string;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [apiBase, exercise.id] });

  const addMutation = useMutation({
    mutationFn: (substituteExerciseId: string) =>
      apiFetch(`${apiBase}/${exercise.id}/substitutions`, {
        method: "POST",
        body: JSON.stringify({ substituteExerciseId }),
      }),
    onSuccess: () => {
      resetPicker();
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (subId: string) =>
      apiFetch(`${apiBase}/${exercise.id}/substitutions/${subId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  function resetPicker() {
    setAdding(false);
    setSearchInput("");
    setSearch("");
  }

  const existingIds = useMemo(
    () => new Set([exercise.id, ...exercise.substitutes.map((s) => s.exerciseId)]),
    [exercise],
  );

  const originFilter = mode === "base" ? "&origin=base" : "";
  const { data: results, isFetching } = useQuery({
    queryKey: [apiBase, "sub-search", mode, search],
    queryFn: () =>
      apiFetch<PickerResponse>(
        `${apiBase}?search=${encodeURIComponent(search)}${originFilter}&pageSize=8`,
      ),
    enabled: adding && search.length >= 2,
  });

  const options = (results?.items ?? []).filter((e) => !existingIds.has(e.id));

  const addError =
    addMutation.error instanceof ApiError ? addMutation.error.message : undefined;
  const newLabel = mode === "base" ? "Novo substituto base" : "Novo substituto";
  const emptyLabel =
    mode === "base"
      ? "Nenhum substituto base cadastrado para este exercício."
      : "Nenhum substituto cadastrado para este exercício.";

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold text-foreground">
          Substituições
        </h2>
        {!adding && (
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
      <p className="mt-1 text-sm text-muted-foreground">
        Exercícios que treinam o mesmo músculo e podem entrar no lugar deste.
      </p>

      {adding && (
        <div className="mt-3 rounded-2xl bg-card p-4 shadow-rest">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{newLabel}</span>
            <button
              type="button"
              onClick={resetPicker}
              aria-label="Cancelar"
              className="rounded-full p-1 text-meta transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-meta" />
              <Input
                type="search"
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar exercício substituto…"
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
                    Nenhum exercício encontrado.
                  </li>
                ) : (
                  options.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => addMutation.mutate(e.id)}
                        disabled={addMutation.isPending}
                        className="flex w-full items-center justify-between gap-2 border-b border-border-light px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-surface-light disabled:opacity-50"
                      >
                        <span className="min-w-0 break-words text-foreground">
                          {e.name}
                        </span>
                        <span className="shrink-0 text-xs text-meta">
                          {EQUIPMENT_LABELS[e.equipment]}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {addError && (
            <p className="mt-3 text-body-dense text-destructive">{addError}</p>
          )}
        </div>
      )}

      {exercise.substitutes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercise.substitutes.map((s) => {
            return (
              <li
                key={s.id}
                className="group relative flex items-center gap-3 rounded-2xl bg-card p-3 shadow-rest"
              >
                <Link
                  href={`${backHref}/${s.exerciseId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <ExerciseThumb image={s.image} className="size-14 rounded-xl" />
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium text-foreground">
                      {s.name}
                    </div>
                    <div className="mt-0.5 text-xs text-meta">
                      {EQUIPMENT_LABELS[s.equipment]}
                    </div>
                  </div>
                </Link>
                {s.removable && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(s.id)}
                    disabled={removeMutation.isPending}
                    aria-label="Remover substituto"
                    title="Remover substituto"
                    className="shrink-0 rounded-full p-1 text-meta transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
