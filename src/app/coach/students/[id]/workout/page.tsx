"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, FileText, Loader2, Pencil, Plus, Search } from "lucide-react";

import {
  WorkoutExerciseDetail,
  WorkoutSessionsView,
  type GroupInfo,
} from "@/components/workouts/workout-detail-view";
import {
  WorkoutBuilder,
  type WorkoutBuilderPayload,
} from "@/components/workouts/workout-builder";
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
import { apiFetch } from "@/lib/api-client";
import type {
  StudentWorkoutStateDto,
  StudentWorkoutVersionDto,
} from "@/lib/student-workouts";
import type {
  WorkoutDetailDto,
  WorkoutExerciseDto,
  WorkoutListResponse,
} from "@/lib/workouts";
import type { StudentRosterDto } from "@/lib/students";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Wraps a draft's live-hydrated sessions as the detail shape the builder edits. */
function draftToDetail(
  draft: NonNullable<StudentWorkoutStateDto["draft"]>,
): WorkoutDetailDto {
  return {
    id: draft.workoutId,
    name: draft.workoutName,
    notes: draft.notes,
    origin: "clinic",
    archived: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    sessions: draft.sessions,
  };
}

export default function StudentWorkoutPage() {
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
    queryKey: ["student-workout", id],
    queryFn: () => apiFetch<StudentWorkoutStateDto>(`/api/students/${id}/workout`),
    retry: false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["student-workout", id] });

  const [dialog, setDialog] = useState<null | "blank" | "assign">(null);
  const [blankName, setBlankName] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [viewVersionId, setViewVersionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<{
    exercise: WorkoutExerciseDto;
    group: GroupInfo | null;
  } | null>(null);

  const startBlank = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/students/${id}/workout`, {
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
    mutationFn: (workoutId: string) =>
      apiFetch(`/api/students/${id}/workout`, {
        method: "POST",
        body: JSON.stringify({ kind: "template", workoutId }),
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
      apiFetch(`/api/students/${id}/workout`, {
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
      apiFetch(`/api/students/${id}/workout/draft`, { method: "DELETE" }),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: () =>
      apiFetch<{ workout: { id: string } }>(`/api/students/${id}/workout/template`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      setBanner("Treino salvo como modelo na sua lista de treinos.");
    },
  });

  const current = state.data?.current ?? null;
  const draft = state.data?.draft ?? null;
  const history = state.data?.history ?? [];

  async function saveDraft(payload: WorkoutBuilderPayload) {
    await apiFetch(`/api/students/${id}/workout/draft`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await invalidate();
  }
  async function publishDraft(payload: WorkoutBuilderPayload) {
    await apiFetch(`/api/students/${id}/workout/draft/publish`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setEditing(false);
    await invalidate();
  }
  async function discardDraft() {
    await apiFetch(`/api/students/${id}/workout/draft`, { method: "DELETE" });
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
        className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold text-foreground">{name}</h1>
      <div className="mt-4">
        <StudentTabs studentId={id} />
      </div>

      {banner && (
        <div className="mt-4 rounded-[10px] bg-primary/10 px-4 py-2.5 text-[13px] font-medium text-primary">
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
        <div className="mt-6">
          <div className="mb-3 rounded-[10px] bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-700">
            {draft.isNewWorkout
              ? "Novo treino em rascunho — o aluno ainda vê o treino publicado anterior até você publicar."
              : "Editando o treino ativo — publique para gerar uma nova versão."}
          </div>
          <WorkoutBuilder
            mode="edit"
            workout={draftToDetail(draft)}
            adapter={{
              onSave: saveDraft,
              onPublish: publishDraft,
              onDiscard: discardDraft,
              onCancel: () => setEditing(false),
              publishLabel: draft.isNewWorkout ? "Publicar (v1)" : "Publicar versão",
            }}
          />
        </div>
      ) : current ? (
        <CurrentView
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
          onExerciseClick={(exercise, group) => setDetail({ exercise, group })}
        />
      ) : draft ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <p className="font-heading text-base font-semibold text-foreground">
            {draft.workoutName}
          </p>
          <p className="mt-1 text-[13px] text-amber-700">
            Rascunho não publicado — o aluno ainda não vê este treino. Publique para
            deixá-lo ativo.
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
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-white p-10 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <p className="text-sm text-muted-foreground">
            Este aluno ainda não tem um treino.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <Button onClick={() => setDialog("blank")}>
              <Plus className="size-4" />
              Criar treino novo
            </Button>
            <Button variant="outline" onClick={() => setDialog("assign")}>
              <FileText className="size-4" />
              Atribuir da minha lista
            </Button>
          </div>
        </div>
      )}

      <WorkoutExerciseDetail
        exercise={detail?.exercise ?? null}
        group={detail?.group ?? null}
        onClose={() => setDetail(null)}
      />

      {/* Create-blank name dialog */}
      <Dialog open={dialog === "blank"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo treino</DialogTitle>
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
              placeholder="Nome do treino (ex.: Hipertrofia · 4x semana)"
              maxLength={120}
            />
            {startBlank.isError && (
              <p className="text-[13px] text-destructive">
                {(startBlank.error as Error).message}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!blankName.trim() || startBlank.isPending}>
                {startBlank.isPending ? "Criando…" : "Criar rascunho"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign-from-template picker */}
      <Dialog open={dialog === "assign"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir treino da minha lista</DialogTitle>
          </DialogHeader>
          <TemplatePicker
            search={templateSearch}
            onSearch={setTemplateSearch}
            onPick={(workoutId) => assign.mutate(workoutId)}
            picking={assign.isPending}
          />
          {assign.isError && (
            <p className="text-[13px] text-destructive">
              {(assign.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Read-only history version view */}
      <Dialog
        open={viewVersionId !== null}
        onOpenChange={(o) => !o && setViewVersionId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {viewVersionId && <VersionView studentId={id} versionId={viewVersionId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CurrentView({
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
  onExerciseClick,
}: {
  current: NonNullable<StudentWorkoutStateDto["current"]>;
  draft: StudentWorkoutStateDto["draft"];
  history: StudentWorkoutStateDto["history"];
  busy: boolean;
  discarding: boolean;
  onEdit: () => void;
  onContinueDraft: () => void;
  onDiscardDraft: () => void;
  onNewBlank: () => void;
  onAssign: () => void;
  onSaveAsTemplate: () => void;
  onViewVersion: (versionId: string) => void;
  onExerciseClick: (exercise: WorkoutExerciseDto, group: GroupInfo | null) => void;
}) {
  const hasDraft = draft !== null;
  const olderOfCurrent = (
    history.find((h) => h.workoutId === current.workoutId)?.versions ?? []
  ).filter((v) => v.version !== current.version);
  const pastWorkouts = history.filter((h) => h.workoutId !== current.workoutId);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-foreground">
            {current.workoutName}
          </h2>
          <p className="text-[13px] text-muted-foreground">
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[13px] font-medium text-amber-700">
            Há um rascunho não publicado deste treino. O aluno continua vendo a versão{" "}
            {current.version} até você publicar.
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
        <p className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {current.notes}
        </p>
      )}

      <WorkoutSessionsView
        sessions={current.sessions}
        onExerciseClick={onExerciseClick}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-white px-4 py-3 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <span className="text-sm font-medium text-foreground">Novo treino:</span>
        <Button variant="outline" size="sm" onClick={onNewBlank} disabled={busy || hasDraft}>
          <Plus className="size-4" />
          Em branco
        </Button>
        <Button variant="outline" size="sm" onClick={onAssign} disabled={busy || hasDraft}>
          <FileText className="size-4" />
          Da minha lista
        </Button>
        <span className="text-xs text-muted-foreground">
          {hasDraft
            ? "Publique ou descarte o rascunho atual antes de começar outro treino."
            : "Vira o treino atual quando você publicar; o atual vai para o histórico."}
        </span>
      </div>

      {(olderOfCurrent.length > 0 || pastWorkouts.length > 0) && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <h3 className="font-heading text-base font-semibold text-foreground">
            Histórico
          </h3>
          {olderOfCurrent.length > 0 && (
            <div className="mt-3">
              <p className="text-[13px] font-medium text-foreground">
                {current.workoutName} — versões anteriores
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {olderOfCurrent.map((v) => (
                  <button
                    key={v.versionId}
                    type="button"
                    onClick={() => onViewVersion(v.versionId)}
                    className="rounded-full border border-border bg-surface-light px-2.5 py-0.5 text-xs font-medium text-[#475569] hover:border-primary hover:text-primary"
                  >
                    v{v.version} · {fmtDate(v.publishedAt)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {pastWorkouts.map((h) => (
            <div key={h.workoutId} className="mt-3">
              <p className="text-[13px] font-medium text-foreground">
                {h.workoutName}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (arquivado)
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {h.versions.map((v) => (
                  <button
                    key={v.versionId}
                    type="button"
                    onClick={() => onViewVersion(v.versionId)}
                    className="rounded-full border border-border bg-surface-light px-2.5 py-0.5 text-xs font-medium text-[#475569] hover:border-primary hover:text-primary"
                  >
                    v{v.version} · {fmtDate(v.publishedAt)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePicker({
  search,
  onSearch,
  onPick,
  picking,
}: {
  search: string;
  onSearch: (v: string) => void;
  onPick: (workoutId: string) => void;
  picking: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["workouts", { search }],
    queryFn: () =>
      apiFetch<WorkoutListResponse>(
        `/api/workouts?pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ""}`,
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
          placeholder="Buscar nos seus treinos…"
          className="pl-8"
        />
      </div>
      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : !data || data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum treino encontrado.
          </p>
        ) : (
          data.items.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={picking}
              onClick={() => onPick(w.id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {w.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {w.sessionCount} ficha(s) · {w.exerciseCount} ex.
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

function VersionView({
  studentId,
  versionId,
}: {
  studentId: string;
  versionId: string;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student-workout-version", studentId, versionId],
    queryFn: () =>
      apiFetch<StudentWorkoutVersionDto>(
        `/api/students/${studentId}/workout/versions/${versionId}`,
      ),
    retry: false,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
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
        <DialogTitle className="flex items-center gap-2">
          <Dumbbell className="size-5 text-primary" />
          {data.workoutName} · v{data.version}
        </DialogTitle>
      </DialogHeader>
      <p className="text-[13px] text-muted-foreground">
        Publicada em {fmtDate(data.publishedAt)}
      </p>
      {data.notes && (
        <p className="rounded-xl border border-border bg-surface-light/40 px-4 py-2.5 text-sm text-muted-foreground">
          {data.notes}
        </p>
      )}
      <WorkoutSessionsView sessions={data.sessions} />
    </div>
  );
}
