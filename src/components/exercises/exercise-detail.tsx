"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Expand,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

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
import { ExerciseImageLightbox } from "@/components/workouts/exercise-images";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  type ExerciseEquipment,
  exerciseImageUrl,
  FORCE_LABELS,
  LEVEL_LABELS,
  MECHANIC_LABELS,
  MUSCLE_LABELS,
  ORIGIN_LABELS,
  type ExerciseDetailDto,
} from "@/lib/exercises";

/** Detail DTO plus the admin-only clinic name (absent for the coach). */
type Detail = ExerciseDetailDto & { clinicName?: string | null };

/**
 * Who may manage this exercise's substitutions, and how:
 * - `"base"` — the admin edits the shared base rules (only on a base exercise).
 * - `"clinic"` — the coach adds/removes its OWN clinic rules on any visible
 *   exercise; the base rules stay read-only (a coach can't alter the base).
 */
type ManageMode = "base" | "clinic";

/**
 * The exercise detail view — image gallery, facets and step-by-step
 * instructions. Reused by the coach library and the admin catalog; they differ
 * only in the API endpoint, the back link, and whether substitutions are
 * editable (`manage`).
 */
export function ExerciseDetail({
  apiBase,
  backHref,
  manage,
}: {
  /** API detail endpoint base, e.g. "/api/exercises". */
  apiBase: string;
  /** Where the "back" link points, e.g. "/coach/library/exercises". */
  backHref: string;
  /**
   * Substitution editing mode (see {@link ManageMode}). Omit for a read-only
   * view. Writes go to `${apiBase}/${id}/substitutions`.
   */
  manage?: ManageMode;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  /** Index into the resolved gallery images; null = the viewer is closed. */
  const [zoomed, setZoomed] = useState<number | null>(null);

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

  // Editing follows ownership: a coach edits its clinic exercises, the admin
  // edits the shared base ones.
  const canEdit =
    !!data &&
    !data.archived &&
    ((manage === "clinic" && data.origin === "clinic") ||
      (manage === "base" && data.origin === "base"));
  // Archiving is broader for the admin: as a moderation action it may retire any
  // exercise (base OR a clinic's own); a coach still archives only its own.
  const canArchive =
    !!data &&
    !data.archived &&
    (manage === "clinic" ? data.origin === "clinic" : manage === "base");
  // The admin may also restore any archived exercise.
  const canUnarchive = !!data && data.archived && manage === "base";

  // The gallery's images resolved to URLs, dropping any that don't resolve.
  // The viewer walks this same array, so a tile's position IS its index there.
  const gallery = (data?.images ?? [])
    .map((key) => exerciseImageUrl(key))
    .filter((url): url is string => Boolean(url));

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
        <div className="mt-4 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando exercício…
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-2xl bg-white p-10 text-center text-sm text-destructive shadow-rest">
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

          {/* Edit (owner only) / archive (admin may archive any exercise). */}
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

          {/* Facets */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="font-medium">
              {CATEGORY_LABELS[data.category]}
            </Badge>
            <Badge variant="base" className="font-medium">
              {LEVEL_LABELS[data.level]}
            </Badge>
            {data.equipment && (
              <Badge variant="neutral" className="font-medium">
                {EQUIPMENT_LABELS[data.equipment]}
              </Badge>
            )}
            {data.force && (
              <Badge variant="neutral" className="font-medium">
                {FORCE_LABELS[data.force]}
              </Badge>
            )}
            {data.mechanic && (
              <Badge variant="neutral" className="font-medium">
                {MECHANIC_LABELS[data.mechanic]}
              </Badge>
            )}
          </div>

          {/* Description (free text) */}
          {data.description && (
            <p className="mt-4 text-sm leading-relaxed text-[#334155]">
              {data.description}
            </p>
          )}

          {/* Image gallery — a tile opens the full-size viewer at its position */}
          {gallery.length > 0 && (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {gallery.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setZoomed(i)}
                    aria-label={`Ampliar imagem ${i + 1} de ${data.name}`}
                    title="Ampliar"
                    className="group relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-2xl border border-border bg-surface-light"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={data.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-white group-hover:flex group-focus-visible:flex">
                      <Expand className="size-5" />
                    </span>
                  </button>
                ))}
              </div>
              <ExerciseImageLightbox
                images={gallery}
                name={data.name}
                index={zoomed}
                onIndexChange={setZoomed}
              />
            </>
          )}

          {/* Muscles */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-rest">
              <h2 className="text-sm font-semibold text-foreground">
                Músculos primários
              </h2>
              <p className="mt-1 text-body-dense text-[#475569]">
                {data.primaryMuscles.length > 0
                  ? data.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")
                  : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-rest">
              <h2 className="text-sm font-semibold text-foreground">
                Músculos secundários
              </h2>
              <p className="mt-1 text-body-dense text-[#475569]">
                {data.secondaryMuscles.length > 0
                  ? data.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")
                  : "—"}
              </p>
            </div>
          </div>

          {/* Substitutions — swap this exercise for one that trains the same
              muscle the same way (seeded to favor common gym equipment). The
              admin manages the base rules; a coach manages its own clinic rules
              (base stays read-only); everyone else sees them read-only. The
              admin only manages base exercises — a clinic exercise is read-only
              for it too. */}
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
                    const src = exerciseImageUrl(s.thumbnail);
                    return (
                      <li key={s.id}>
                        <Link
                          href={`${backHref}/${s.exerciseId}`}
                          className="group flex items-center gap-3 rounded-2xl bg-white p-3 shadow-rest transition-colors hover:border-primary"
                        >
                          <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-surface-light">
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt={s.name}
                                loading="lazy"
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="break-words text-sm font-medium text-foreground">
                              {s.name}
                            </div>
                            {s.equipment && (
                              <div className="mt-0.5 text-xs text-meta">
                                {EQUIPMENT_LABELS[s.equipment]}
                              </div>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          )}

          {/* Instructions */}
          {data.instructions.length > 0 && (
            <div className="mt-6">
              <h2 className="font-heading text-lg font-bold text-foreground">
                Como executar
              </h2>
              <ol className="mt-3 space-y-3">
                {data.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-body-dense font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-[#334155]">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </article>
      ) : null}
    </div>
  );
}

/** Minimal shape shared by the coach and admin listing responses (for the picker). */
type PickerResponse = {
  items: { id: string; name: string; equipment: ExerciseEquipment | null }[];
};

/**
 * The editable substitutions section. Inline — it's part of this reused
 * component, not a standalone one-off. Writes go through
 * `${apiBase}/${id}/substitutions`. Two modes (see {@link ManageMode}):
 * - `"base"` (admin): manages the shared base rules; the picker is restricted to
 *   base exercises so a base rule never points at a clinic's own exercise.
 * - `"clinic"` (coach): adds/removes the clinic's OWN rules; the picker spans
 *   every exercise the clinic can see. Base rules render read-only (no delete).
 */
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

  // Exclude the exercise itself and its current substitutes from the picker.
  const existingIds = useMemo(
    () => new Set([exercise.id, ...exercise.substitutes.map((s) => s.exerciseId)]),
    [exercise],
  );

  // A base rule may only point at another base exercise (a clinic exercise would
  // leak); a clinic rule may point at anything the clinic can see.
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
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-rest">
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
                        className="flex w-full items-center justify-between gap-2 border-b border-[#F1F5F9] px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-surface-light disabled:opacity-50"
                      >
                        <span className="min-w-0 break-words text-foreground">
                          {e.name}
                        </span>
                        {e.equipment && (
                          <span className="shrink-0 text-xs text-meta">
                            {EQUIPMENT_LABELS[e.equipment]}
                          </span>
                        )}
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
            const src = exerciseImageUrl(s.thumbnail);
            return (
              <li
                key={s.id}
                className="group relative flex items-center gap-3 rounded-2xl bg-white p-3 shadow-rest"
              >
                <Link
                  href={`${backHref}/${s.exerciseId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-surface-light">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={s.name}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium text-foreground">
                      {s.name}
                    </div>
                    {s.equipment && (
                      <div className="mt-0.5 text-xs text-meta">
                        {EQUIPMENT_LABELS[s.equipment]}
                      </div>
                    )}
                  </div>
                </Link>
                {/* Only the viewer's own rules are removable; base rules that a
                    coach merely inherits render without a delete control. */}
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
