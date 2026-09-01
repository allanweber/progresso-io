"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  DietMealsView,
  MacroSummary,
} from "@/components/diets/diet-detail-view";
import {
  DietBuilder,
  type DietBuilderPayload,
} from "@/components/diets/diet-builder";
import { AiGenerateButton } from "@/components/ai/ai-generate-button";
import { StudentTabs } from "@/components/students/student-tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatKcal, type DietListResponse } from "@/lib/diets";
import {
  treeToDietDetail,
  treeToMealDtos,
  type StudentDietStateDto,
  type StudentDietVersionDto,
} from "@/lib/student-diets";
import type { StudentRosterDto } from "@/lib/students";

/** A published-at ISO string as a pt-BR date. */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function StudentDietPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const student = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  const state = useQuery({
    queryKey: ["student-diet", id],
    queryFn: () => apiFetch<StudentDietStateDto>(`/api/students/${id}/diet`),
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["student-diet", id] });

  /**
   * A generation just wrote a draft — open it.
   *
   * Every other path that creates a draft (`startBlank`, `assign`, `edit`)
   * ends in `setEditing(true)`, and generating is the same event: the coach
   * asked for a program and one now exists. Refetching alone leaves the page
   * showing the *published* dieta, with the new draft reduced to a one-line
   * banner and its contents nowhere on screen — which reads as "nothing was
   * generated", and puts "Descartar rascunho" under the cursor as the only
   * offered action. Awaiting the invalidation first is load-bearing: the
   * builder only renders once `draft` is actually in the cache.
   */
  const openGenerated = async () => {
    await invalidate();
    setEditing(true);
  };

  const [dialog, setDialog] = useState<null | "blank" | "assign">(null);
  const [blankName, setBlankName] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [viewVersionId, setViewVersionId] = useState<string | null>(null);
  // The history version awaiting a delete confirmation (label = what the dialog
  // names, so the coach sees exactly which version is about to go).
  const [deleteTarget, setDeleteTarget] = useState<
    { versionId: string; label: string } | null
  >(null);
  const [banner, setBanner] = useState<string | null>(null);
  // The tab always opens in a read/view; the builder is entered only by an
  // explicit action (Editar / Continuar editando / Nova dieta). Local state, so
  // it resets to the view every time the tab is (re)opened.
  const [editing, setEditing] = useState(false);

  /* --- draft lifecycle (start / edit / new) ------------------------------ */

  const startBlank = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/students/${id}/diet`, {
        method: "POST",
        body: JSON.stringify({ kind: "blank", name }),
      }),
    onSuccess: async () => {
      setDialog(null);
      setBlankName("");
      setEditing(true);
      await invalidate();
    },
  });

  const assign = useMutation({
    mutationFn: (dietId: string) =>
      apiFetch(`/api/students/${id}/diet`, {
        method: "POST",
        body: JSON.stringify({ kind: "template", dietId }),
      }),
    onSuccess: async () => {
      setDialog(null);
      setTemplateSearch("");
      setEditing(true);
      await invalidate();
    },
  });

  const edit = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/diet`, {
        method: "POST",
        body: JSON.stringify({ kind: "edit" }),
      }),
    onSuccess: async () => {
      setEditing(true);
      await invalidate();
    },
  });

  const discardDraftMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/diet/draft`, { method: "DELETE" }),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: () =>
      apiFetch<{ diet: { id: string } }>(
        `/api/students/${id}/diet/template`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diets"] });
      setBanner("Dieta salva como modelo na sua lista de dietas.");
    },
  });

  /**
   * Removes one published version from the histórico. The current (aluno-visible)
   * version is not offered here and is refused by the API, so this never changes
   * what the student is following.
   */
  const deleteVersion = useMutation({
    mutationFn: (versionId: string) =>
      apiFetch(`/api/students/${id}/diet/versions/${versionId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_data, versionId) => {
      queryClient.removeQueries({
        queryKey: ["student-diet-version", id, versionId],
      });
      // The open read-only view may be the version that just went.
      setViewVersionId((open) => (open === versionId ? null : open));
      setDeleteTarget(null);
      await invalidate();
    },
  });

  /* --- builder adapter (save / publish / discard the server draft) -------- */

  const current = state.data?.current ?? null;
  const draft = state.data?.draft ?? null;
  const history = state.data?.history ?? [];

  async function saveDraft(payload: DietBuilderPayload) {
    await apiFetch(`/api/students/${id}/diet/draft`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await invalidate();
  }
  async function publishDraft(payload: DietBuilderPayload) {
    // Publishing an untouched draft changes nothing for the aluno, so the API
    // closes it without numbering a version — say which of the two happened,
    // otherwise the editor just closes and the coach cannot tell.
    const res = await apiFetch<{ version: number; unchanged: boolean }>(
      `/api/students/${id}/diet/draft/publish`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    setBanner(
      res.unchanged
        ? `Nenhuma alteração na dieta — o aluno continua na versão ${res.version}.`
        : `Versão ${res.version} publicada para o aluno.`,
    );
    setEditing(false);
    await invalidate();
  }
  async function discardDraft() {
    await apiFetch(`/api/students/${id}/diet/draft`, { method: "DELETE" });
    setEditing(false);
    await invalidate();
  }

  const name = student.data
    ? `${student.data.firstName} ${student.data.lastName}`
    : "Aluno";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/students"
        className="text-body-dense text-meta transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">
        {name}
      </h1>
      <div className="mt-4">
        <StudentTabs studentId={id} />
      </div>

      {banner && (
        <div className="mt-4 rounded-[10px] bg-primary/10 px-4 py-2.5 text-body-dense font-medium text-primary">
          {banner}
        </div>
      )}

      {state.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
      ) : state.isError ? (
        <p className="mt-8 text-sm text-destructive">
          {(state.error as Error).message}
        </p>
      ) : editing && draft ? (
        /* --- Builder: entered only by an explicit edit/new action --------- */
        <div className="mt-6">
          <DietBuilder
            mode="edit"
            diet={treeToDietDetail(
              draft.dietId,
              draft.dietName,
              draft.notes,
              draft.tree,
            )}
            adapter={{
              onSave: saveDraft,
              onPublish: publishDraft,
              onDiscard: discardDraft,
              onCancel: () => setEditing(false),
              publishLabel: draft.isNewDiet ? "Publicar (v1)" : "Publicar versão",
            }}
          />
        </div>
      ) : current ? (
        /* --- An active published diet → read view + history -------------- */
        <CurrentView
          studentId={id}
          goal={student.data?.goal}
          onGenerated={openGenerated}
          current={current}
          draft={draft}
          history={history}
          busy={edit.isPending || saveAsTemplate.isPending}
          discarding={discardDraftMut.isPending}
          onEdit={() => edit.mutate()}
          onContinueDraft={() => setEditing(true)}
          onDiscardDraft={() => discardDraftMut.mutate()}
          onNewBlank={() => setDialog("blank")}
          onAssign={() => setDialog("assign")}
          onSaveAsTemplate={() => saveAsTemplate.mutate()}
          onViewVersion={setViewVersionId}
          onDeleteVersion={setDeleteTarget}
        />
      ) : draft ? (
        /* --- A first-ever diet still in draft (nothing published yet) ----- */
        <div className="mt-6 rounded-2xl border border-transparent bg-warn-bg p-6 text-center shadow-rest">
          <p className="font-heading text-base font-semibold text-foreground">
            {draft.dietName}
          </p>
          <p className="mt-1 text-body-dense text-warn-fg">
            Rascunho não publicado — o aluno ainda não vê esta dieta. Publique
            para deixá-la ativa.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Continuar editando
            </Button>
            <Button
              variant="outline"
              onClick={() => discardDraftMut.mutate()}
              disabled={discardDraftMut.isPending}
            >
              {discardDraftMut.isPending ? "Descartando…" : "Descartar rascunho"}
            </Button>
            <AiGenerateButton
              studentId={id}
              kind="diet"
              hasDraft
              defaultObjective={student.data?.goal}
              onGenerated={openGenerated}
            />
          </div>
        </div>
      ) : (
        /* --- No diet yet ------------------------------------------------- */
        <div className="mt-6 rounded-2xl bg-white p-10 text-center shadow-rest">
          <p className="text-sm text-muted-foreground">
            Este aluno ainda não tem uma dieta.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <Button onClick={() => setDialog("blank")}>
              <Plus className="size-4" />
              Criar dieta nova
            </Button>
            <Button variant="outline" onClick={() => setDialog("assign")}>
              <FileText className="size-4" />
              Atribuir da minha lista
            </Button>
            <AiGenerateButton
              studentId={id}
              kind="diet"
              hasDraft={false}
              defaultObjective={student.data?.goal}
              onGenerated={openGenerated}
            />
          </div>
        </div>
      )}

      {/* Create-blank name dialog */}
      <Dialog
        open={dialog === "blank"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova dieta</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (blankName.trim()) startBlank.mutate(blankName.trim());
            }}
            className="space-y-3"
          >
            <Input
              autoFocus
              value={blankName}
              onChange={(e) => setBlankName(e.target.value)}
              placeholder="Nome da dieta (ex.: Cutting 1800 kcal)"
              maxLength={120}
            />
            {startBlank.isError && (
              <p className="text-body-dense text-destructive">
                {(startBlank.error as Error).message}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={!blankName.trim() || startBlank.isPending}
              >
                {startBlank.isPending ? "Criando…" : "Criar rascunho"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign-from-template picker */}
      <Dialog
        open={dialog === "assign"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir dieta da minha lista</DialogTitle>
          </DialogHeader>
          <TemplatePicker
            search={templateSearch}
            onSearch={setTemplateSearch}
            onPick={(dietId) => assign.mutate(dietId)}
            picking={assign.isPending}
          />
          {assign.isError && (
            <p className="text-body-dense text-destructive">
              {(assign.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Read-only history version view */}
      <Dialog
        open={viewVersionId !== null}
        onOpenChange={(open) => {
          if (!open) setViewVersionId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {viewVersionId && (
            <VersionView studentId={id} versionId={viewVersionId} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete-one-version confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteVersion.isPending) {
            setDeleteTarget(null);
            deleteVersion.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir versão do histórico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Excluir{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.label}
              </span>{" "}
              do histórico deste aluno? A prescrição dessa versão é apagada para
              sempre — não há como desfazer. A dieta atual do aluno não muda.
            </p>
            {deleteVersion.error instanceof ApiError ? (
              <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
                {deleteVersion.error.message}
              </div>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteVersion.isPending}
                onClick={() =>
                  deleteTarget && deleteVersion.mutate(deleteTarget.versionId)
                }
              >
                <Trash2 className="size-4" />
                {deleteVersion.isPending ? "Excluindo…" : "Excluir versão"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  State 2 — the active published diet, its actions and history               */
/* -------------------------------------------------------------------------- */

function CurrentView({
  studentId,
  goal,
  onGenerated,
  current,
  draft,
  history,
  busy,
  discarding,
  onEdit,
  onContinueDraft,
  onDiscardDraft,
  onNewBlank,
  onAssign,
  onSaveAsTemplate,
  onViewVersion,
  onDeleteVersion,
}: {
  studentId: string;
  goal: string | null | undefined;
  onGenerated: () => void;
  current: NonNullable<StudentDietStateDto["current"]>;
  draft: StudentDietStateDto["draft"];
  history: StudentDietStateDto["history"];
  busy: boolean;
  discarding: boolean;
  onEdit: () => void;
  onContinueDraft: () => void;
  onDiscardDraft: () => void;
  onNewBlank: () => void;
  onAssign: () => void;
  onSaveAsTemplate: () => void;
  onViewVersion: (versionId: string) => void;
  onDeleteVersion: (target: { versionId: string; label: string }) => void;
}) {
  const hasDraft = draft !== null;
  const meals = treeToMealDtos(current.tree);
  // Past diets (archived) and older versions of the current diet.
  const olderOfCurrent = (
    history.find((h) => h.dietId === current.dietId)?.versions ?? []
  ).filter((v) => v.version !== current.version);
  const pastDiets = history.filter((h) => h.dietId !== current.dietId);

  return (
    <div className="mt-6 space-y-4">
      {/* Start a different diet */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-white px-4 py-3 shadow-rest">
        <span className="text-sm font-medium text-foreground">Nova dieta:</span>
        <Button
          variant="outline"
          size="sm"
          onClick={onNewBlank}
          disabled={busy || hasDraft}
        >
          <Plus className="size-4" />
          Em branco
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAssign}
          disabled={busy || hasDraft}
        >
          <FileText className="size-4" />
          Da minha lista
        </Button>
        {/* Not disabled by `hasDraft` like its neighbours: those two would start
            a *second* diet, which is what the draft blocks. The generator writes
            into the draft, and asks before replacing it. */}
        <AiGenerateButton
          studentId={studentId}
          kind="diet"
          hasDraft={hasDraft}
          defaultObjective={goal}
          onGenerated={onGenerated}
        />
        <span className="text-xs text-muted-foreground">
          {hasDraft
            ? "Publique ou descarte o rascunho atual antes de começar outra dieta."
            : "Vira a dieta atual quando você publicar; a atual vai para o histórico."}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">
            {current.dietName}
          </h2>
          <p className="text-body-dense text-muted-foreground">
            Versão {current.version} · publicada em {fmtDate(current.publishedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasDraft ? (
            <Button onClick={onContinueDraft}>
              <Pencil className="size-4" />
              Continuar editando
            </Button>
          ) : (
            <Button onClick={onEdit} disabled={busy}>
              <Pencil className="size-4" />
              Editar
            </Button>
          )}
          <Button variant="outline" onClick={onSaveAsTemplate} disabled={busy}>
            <FileText className="size-4" />
            Salvar como modelo
          </Button>
        </div>
      </div>

      {hasDraft && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-transparent bg-warn-bg px-4 py-3">
          <p className="text-body-dense font-medium text-warn-fg">
            {/* A generated draft is a *different* dieta with its own name, not
                another version of this one — naming it is the only thing on
                this screen that shows the generation produced anything. */}
            {draft.dietName === current.dietName
              ? "Há um rascunho não publicado desta dieta."
              : `Há um rascunho não publicado: ${draft.dietName}.`}{" "}
            O aluno continua vendo a versão {current.version} até você publicar.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onDiscardDraft}
            disabled={discarding}
          >
            {discarding ? "Descartando…" : "Descartar rascunho"}
          </Button>
        </div>
      )}

      {current.notes && (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-muted-foreground shadow-rest">
          {current.notes}
        </p>
      )}

      <MacroSummary
        totals={current.tree.totals}
        className="rounded-2xl bg-white px-5 py-3 shadow-rest"
      />

      <DietMealsView meals={meals} />

      {/* History */}
      {(olderOfCurrent.length > 0 || pastDiets.length > 0) && (
        <div className="rounded-2xl bg-white p-5 shadow-rest">
          <h3 className="font-heading text-base font-semibold text-foreground">
            Histórico
          </h3>
          {olderOfCurrent.length > 0 && (
            <div className="mt-3">
              <p className="text-body-dense font-medium text-foreground">
                {current.dietName} — versões anteriores
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {olderOfCurrent.map((v) => (
                  <VersionChip
                    key={v.versionId}
                    dietName={current.dietName}
                    version={v}
                    onView={onViewVersion}
                    onDelete={onDeleteVersion}
                  />
                ))}
              </div>
            </div>
          )}
          {pastDiets.map((h) => (
            <div key={h.dietId} className="mt-3">
              <p className="text-body-dense font-medium text-foreground">
                {h.dietName}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (arquivada)
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {h.versions.map((v) => (
                  <VersionChip
                    key={v.versionId}
                    dietName={h.dietName}
                    version={v}
                    onView={onViewVersion}
                    onDelete={onDeleteVersion}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  One history entry: open it, or delete it                                   */
/* -------------------------------------------------------------------------- */

function VersionChip({
  dietName,
  version,
  onView,
  onDelete,
}: {
  dietName: string;
  version: StudentDietStateDto["history"][number]["versions"][number];
  onView: (versionId: string) => void;
  onDelete: (target: { versionId: string; label: string }) => void;
}) {
  const label = `${dietName} v${version.version}`;
  return (
    <span className="inline-flex items-center overflow-hidden rounded-full border border-border bg-surface-light text-xs font-medium text-[#475569]">
      <button
        type="button"
        onClick={() => onView(version.versionId)}
        className="px-2.5 py-0.5 transition-colors hover:text-primary"
      >
        v{version.version} · {fmtDate(version.publishedAt)}
      </button>
      <button
        type="button"
        aria-label={`Excluir ${label}`}
        title="Excluir esta versão"
        onClick={() =>
          onDelete({ versionId: version.versionId, label })
        }
        className="border-l border-border px-1.5 py-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Template picker (assign from the coach's diet list)                        */
/* -------------------------------------------------------------------------- */

function TemplatePicker({
  search,
  onSearch,
  onPick,
  picking,
}: {
  search: string;
  onSearch: (v: string) => void;
  onPick: (dietId: string) => void;
  picking: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["diets", { search }],
    queryFn: () =>
      apiFetch<DietListResponse>(
        `/api/diets?pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar nas suas dietas…"
          className="pl-8"
        />
      </div>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Carregando…
          </p>
        ) : !data || data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma dieta encontrada.
          </p>
        ) : (
          data.items.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={picking}
              onClick={() => onPick(d.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {d.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {d.mealCount} ref · {formatKcal(d.totalKcal)} kcal
              </span>
              {picking ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Plus className="size-4 text-muted-foreground" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Read-only history version view                                             */
/* -------------------------------------------------------------------------- */

function VersionView({
  studentId,
  versionId,
}: {
  studentId: string;
  versionId: string;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-diet-version", studentId, versionId],
    queryFn: () =>
      apiFetch<StudentDietVersionDto>(
        `/api/students/${studentId}/diet/versions/${versionId}`,
      ),
    retry: false,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {isError ? (error as Error).message : "Versão não encontrada."}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {data.dietName} · v{data.version}
        </DialogTitle>
      </DialogHeader>
      <p className="text-body-dense text-muted-foreground">
        Publicada em {fmtDate(data.publishedAt)}
      </p>
      {data.notes && (
        <p className="rounded-xl border border-border bg-surface-light/40 px-4 py-2.5 text-sm text-muted-foreground">
          {data.notes}
        </p>
      )}
      <MacroSummary totals={data.tree.totals} />
      <DietMealsView meals={treeToMealDtos(data.tree)} />
    </div>
  );
}
