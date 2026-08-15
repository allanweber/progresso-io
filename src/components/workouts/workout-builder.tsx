"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  GripVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ExercisePicker,
  type PickedExercise,
} from "@/components/workouts/exercise-picker";
import {
  ExercisePrescriptionFields,
  type CustomSubDraft,
  type PrescriptionDraft,
} from "@/components/workouts/exercise-prescription-fields";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import { CATEGORY_LABELS, exerciseImageUrl } from "@/lib/exercises";
import {
  SESSION_SUGGESTIONS,
  formatReps,
  formatRest,
  workoutFormSchema,
  type WorkoutDetailDto,
  type WorkoutMutationResponse,
  type WorkoutReps,
} from "@/lib/workouts";
import {
  isGroupingTechnique,
  techniqueInfo,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";
import { assignGroupIds } from "@/lib/workout-grouping";
import { z } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Draft model (client state)                                                 */
/* -------------------------------------------------------------------------- */

type ExerciseDraft = {
  key: string;
  exerciseId: string;
  name: string;
  code: string | null;
  category: string;
  thumbnail: string | null;
  sets: number;
  reps: WorkoutReps;
  load: string;
  rest: number;
  technique: WorkoutTechnique | null;
  note: string;
  customSubstitutes: CustomSubDraft[];
};

type SessionDraft = { key: string; name: string; exercises: ExerciseDraft[] };
type Draft = { name: string; notes: string; sessions: SessionDraft[] };

/** The whole-tree payload the builder emits on save (matches `workoutFormSchema`). */
export type WorkoutBuilderPayload = {
  name: string;
  notes: string;
  sessions: {
    name: string;
    exercises: {
      exerciseId: string;
      sets: number;
      reps: WorkoutReps;
      load: string | null;
      rest: number;
      technique: WorkoutTechnique | null;
      note: string | null;
      groupId: string | null;
      customSubstitutes: { exerciseId: string; note: string | null }[];
    }[];
  }[];
};

/**
 * Drives a server-persisted draft (a student's workout) instead of the default
 * template create/edit flow. When present, the builder shows Salvar rascunho /
 * Publicar / Descartar and delegates persistence to these callbacks.
 */
export type WorkoutBuilderAdapter = {
  onSave: (payload: WorkoutBuilderPayload) => Promise<void>;
  onPublish: (payload: WorkoutBuilderPayload) => Promise<void>;
  onDiscard: () => Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
  publishLabel?: string;
};

const newKey = () => crypto.randomUUID();

function initialDraft(workout?: WorkoutDetailDto): Draft {
  if (!workout) return { name: "", notes: "", sessions: [] };
  return {
    name: workout.name,
    notes: workout.notes ?? "",
    sessions: workout.sessions.map((s) => ({
      key: newKey(),
      name: s.name,
      exercises: s.exercises.map((x) => ({
        key: newKey(),
        exerciseId: x.exerciseId,
        name: x.name,
        code: x.code,
        category: x.category ? CATEGORY_LABELS[x.category] : "",
        thumbnail: x.images[0] ?? null,
        sets: x.sets,
        reps: x.reps,
        load: x.load ?? "",
        rest: x.rest,
        technique: x.technique,
        note: x.note ?? "",
        // Only the custom substitutes are editable; library ones are live.
        customSubstitutes: x.substitutes
          .filter((sub) => sub.source === "custom")
          .map((sub) => ({
            key: newKey(),
            exerciseId: sub.exerciseId,
            name: sub.name,
            code: sub.code,
            thumbnail: sub.thumbnail,
            note: sub.note ?? "",
          })),
      })),
    })),
  };
}

const withGroupIds = (exercises: ExerciseDraft[]) =>
  assignGroupIds(exercises, newKey);

const shellSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do treino.")
    .max(120, "Nome muito longo."),
  notes: z.string().max(2000, "Observações muito longas."),
});

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function WorkoutBuilder({
  mode,
  workout,
  adapter,
}: {
  mode: "create" | "edit";
  workout?: WorkoutDetailDto;
  adapter?: WorkoutBuilderAdapter;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const persistLocal = !adapter;
  const storageKey = `workout-draft:${adapter ? "student" : mode === "edit" ? workout!.id : "new"}`;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard">(null);

  const [sessions, setSessions] = useState<SessionDraft[]>(
    () => initialDraft(workout).sessions,
  );
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [recovered, setRecovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dirtyRef = useRef(false);
  const [rev, setRev] = useState(0);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setRev((r) => r + 1);
  }, []);

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch<WorkoutMutationResponse>(
        mode === "create" ? "/api/workouts" : `/api/workouts/${workout!.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: (data) => {
      dirtyRef.current = false;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      queryClient.invalidateQueries({ queryKey: ["workout", data.workout.id] });
      router.push(`/coach/workouts/${data.workout.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: { name: workout?.name ?? "", notes: workout?.notes ?? "" },
    validators: { onChange: shellSchema },
    onSubmit: async ({ value }) => {
      if (adapter) {
        await runAdapter("save");
        return;
      }
      const payload = buildPayload(value);
      if (!payload) return;
      const parsed = workoutFormSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        await mutation.mutateAsync(parsed.data);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  function buildPayload(value: {
    name: string;
    notes: string;
  }): WorkoutBuilderPayload | null {
    const errs: Record<string, string> = {};
    for (const s of sessions) {
      if (!s.name.trim()) errs[s.key] = "Informe o nome da ficha.";
    }
    setSessionErrors(errs);
    if (Object.keys(errs).length > 0) return null;
    return {
      name: value.name,
      notes: value.notes,
      sessions: sessions.map((s) => ({
        name: s.name.trim(),
        exercises: withGroupIds(s.exercises).map(({ exercise: x, groupId }) => ({
          exerciseId: x.exerciseId,
          sets: x.sets,
          reps: x.reps,
          load: x.load.trim() === "" ? null : x.load.trim(),
          rest: x.rest,
          technique: x.technique,
          note: x.note.trim() === "" ? null : x.note.trim(),
          groupId,
          customSubstitutes: x.customSubstitutes.map((cs) => ({
            exerciseId: cs.exerciseId,
            note: cs.note.trim() === "" ? null : cs.note.trim(),
          })),
        })),
      })),
    };
  }

  async function runAdapter(kind: "save" | "publish") {
    if (!adapter) return;
    const payload = buildPayload(form.state.values);
    if (!payload) return;
    setBusy(kind);
    setActionError(null);
    try {
      await (kind === "save" ? adapter.onSave : adapter.onPublish)(payload);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function runDiscard() {
    if (!adapter) return;
    setBusy("discard");
    setActionError(null);
    try {
      await adapter.onDiscard();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Não foi possível descartar.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!persistLocal) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      if (saved && Array.isArray(saved.sessions)) {
        form.setFieldValue("name", saved.name ?? "");
        form.setFieldValue("notes", saved.notes ?? "");
        /* eslint-disable react-hooks/set-state-in-effect */
        setSessions(saved.sessions);
        setRecovered(true);
        /* eslint-enable react-hooks/set-state-in-effect */
        dirtyRef.current = true;
      }
    } catch {
      /* corrupt draft — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!persistLocal || !dirtyRef.current) return;
    try {
      const draft: Draft = {
        name: form.state.values.name,
        notes: form.state.values.notes,
        sessions,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, rev, storageKey]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const updateSessions = useCallback(
    (updater: (prev: SessionDraft[]) => SessionDraft[]) => {
      setSessions((prev) => updater(prev));
      markDirty();
    },
    [markDirty],
  );

  const addSession = () =>
    updateSessions((prev) => [...prev, { key: newKey(), name: "", exercises: [] }]);
  const patchSession = (key: string, patch: Partial<SessionDraft>) =>
    updateSessions((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeSession = (key: string) =>
    updateSessions((prev) => prev.filter((s) => s.key !== key));
  const patchExercises = (
    sessionKey: string,
    updater: (ex: ExerciseDraft[]) => ExerciseDraft[],
  ) =>
    updateSessions((prev) =>
      prev.map((s) =>
        s.key === sessionKey ? { ...s, exercises: updater(s.exercises) } : s,
      ),
    );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onSessionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updateSessions((prev) => {
      const from = prev.findIndex((s) => s.key === active.id);
      const to = prev.findIndex((s) => s.key === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const serverBanner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  function discardDraft() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    const fresh = initialDraft(workout);
    form.setFieldValue("name", fresh.name);
    form.setFieldValue("notes", fresh.notes);
    setSessions(fresh.sessions);
    setRecovered(false);
    dirtyRef.current = false;
  }

  function cancel() {
    if (dirtyRef.current && !confirm("Descartar as alterações não salvas?")) return;
    dirtyRef.current = false;
    if (adapter) {
      adapter.onCancel();
      return;
    }
    router.push(mode === "edit" ? `/coach/workouts/${workout!.id}` : "/coach/workouts");
  }

  if (!mounted) return <div className="mx-auto max-w-3xl pb-24" aria-hidden />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="mx-auto max-w-3xl pb-24"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Cancelar
        </button>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {adapter ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={runDiscard}
                disabled={busy !== null}
                className="w-full sm:w-auto"
              >
                {busy === "discard" ? "Descartando…" : "Descartar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runAdapter("save")}
                disabled={busy !== null}
                className="w-full sm:w-auto"
              >
                <Save className="size-4" />
                {busy === "save" ? "Salvando…" : (adapter.saveLabel ?? "Salvar rascunho")}
              </Button>
              <Button
                type="button"
                onClick={() => runAdapter("publish")}
                disabled={busy !== null}
                className="w-full sm:w-auto"
              >
                {busy === "publish" ? "Publicando…" : (adapter.publishLabel ?? "Publicar")}
              </Button>
            </>
          ) : (
            <>
              {recovered && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={discardDraft}
                  className="w-full sm:w-auto"
                >
                  Descartar rascunho
                </Button>
              )}
              <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
                <Save className="size-4" />
                {mutation.isPending ? "Salvando…" : "Salvar treino"}
              </Button>
            </>
          )}
        </div>
      </div>

      {recovered && (
        <div className="mb-4 rounded-[10px] bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-700">
          Rascunho não salvo recuperado deste dispositivo.
        </div>
      )}
      {(serverBanner || actionError) && (
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {serverBanner ?? actionError}
        </div>
      )}

      {/* Student workout (adapter) is always an unpublished draft in the builder
          — warn that saving/editing alone doesn't reach the aluno, only Publicar. */}
      {adapter && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Só editar não basta.</span> Salvar
            mantém as alterações como rascunho — o treino só fica disponível para
            o aluno depois que você clicar em{" "}
            <span className="font-semibold">Publicar</span>.
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <form.Field name="name">
          {(field) => (
            <Field
              id="workout-name"
              label="Nome do treino"
              placeholder="Ex.: Hipertrofia · 4x semana"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                field.handleChange(e.target.value);
                markDirty();
              }}
              error={fieldError(field)}
            />
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="workout-notes">Observações (opcional)</Label>
              <Textarea
                id="workout-notes"
                rows={2}
                placeholder="Orientações gerais, aquecimento, cadência…"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  markDirty();
                }}
              />
              {fieldError(field) && (
                <p className="text-[13px] text-destructive">{fieldError(field)}</p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSessionDragEnd}>
        <SortableContext
          items={sessions.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-4 space-y-4">
            {sessions.map((session) => (
              <SortableSession
                key={session.key}
                session={session}
                error={sessionErrors[session.key]}
                sensors={sensors}
                onNameChange={(name) => patchSession(session.key, { name })}
                onRemove={() => removeSession(session.key)}
                onExercises={(updater) => patchExercises(session.key, updater)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addSession}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-4" />
        Nova ficha
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable session (ficha) card                                              */
/* -------------------------------------------------------------------------- */

function SortableSession({
  session,
  error,
  sensors,
  onNameChange,
  onRemove,
  onExercises,
}: {
  session: SessionDraft;
  error?: string;
  sensors: ReturnType<typeof useSensors>;
  onNameChange: (name: string) => void;
  onRemove: () => void;
  onExercises: (updater: (ex: ExerciseDraft[]) => ExerciseDraft[]) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: session.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const [adding, setAdding] = useState(false);

  function addExercise(picked: PickedExercise, prescription: PrescriptionDraft) {
    onExercises((ex) => [
      ...ex,
      {
        key: newKey(),
        exerciseId: picked.id,
        name: picked.name,
        code: picked.code,
        category: CATEGORY_LABELS[picked.category],
        thumbnail: picked.thumbnail,
        sets: prescription.sets,
        reps: prescription.reps,
        load: prescription.load,
        rest: prescription.rest,
        technique: prescription.technique,
        note: prescription.note,
        customSubstitutes: prescription.customSubstitutes,
      },
    ]);
    setAdding(false);
  }

  function onExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onExercises((ex) => {
      const from = ex.findIndex((i) => i.key === active.id);
      const to = ex.findIndex((i) => i.key === over.id);
      return from < 0 || to < 0 ? ex : arrayMove(ex, from, to);
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-start gap-2 border-b border-border p-4">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Reordenar ficha"
          className="mt-2 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-5" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={session.name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nome da ficha (ex.: Ficha A · Peito e Tríceps)"
              aria-invalid={error ? true : undefined}
              className={`flex-1 ${error ? "border-destructive" : ""}`}
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover ficha"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-1.5">
            {SESSION_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onNameChange(s)}
                className="rounded-full border border-border bg-surface-light px-2.5 py-0.5 text-xs font-medium text-[#475569] hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2 p-4">
        {session.exercises.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onExerciseDragEnd}>
            <SortableContext
              items={session.exercises.map((i) => i.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {session.exercises.map((exercise) => (
                  <SortableExercise
                    key={exercise.key}
                    exercise={exercise}
                    sessionExerciseIds={session.exercises.map((e) => e.exerciseId)}
                    onPatch={(patch) =>
                      onExercises((ex) =>
                        ex.map((i) => (i.key === exercise.key ? { ...i, ...patch } : i)),
                      )
                    }
                    onRemove={() =>
                      onExercises((ex) => ex.filter((i) => i.key !== exercise.key))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {adding ? (
          <ExercisePicker
            excludeIds={session.exercises.map((e) => e.exerciseId)}
            onPick={({ exercise, prescription }) =>
              addExercise(exercise, prescription)
            }
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Adicionar exercício
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable exercise row (with prescription editor + custom substitutes)      */
/* -------------------------------------------------------------------------- */

function SortableExercise({
  exercise,
  sessionExerciseIds,
  onPatch,
  onRemove,
}: {
  exercise: ExerciseDraft;
  sessionExerciseIds: string[];
  onPatch: (patch: Partial<ExerciseDraft>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: exercise.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const tech = techniqueInfo(exercise.technique);
  const thumb = exerciseImageUrl(exercise.thumbnail);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-surface-light/40 p-2.5"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Reordenar exercício"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-9 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="size-9 shrink-0 rounded-md bg-surface-light" />
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {exercise.name}
            </span>
            {tech && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ color: tech.color, backgroundColor: tech.bg }}
              >
                {tech.icon} {tech.label}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {exercise.sets}× {formatReps(exercise.reps)}
            {exercise.load ? ` · ${exercise.load}` : ""} · {formatRest(exercise.rest)}
          </span>
          {isGroupingTechnique(exercise.technique) && (
            <span
              className="mt-0.5 block text-[11px] font-medium"
              style={{ color: tech?.color }}
            >
              ↓ sem descanso — encadeia com o próximo exercício
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label="Editar exercício"
          title="Editar"
          className="text-muted-foreground hover:text-primary"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover exercício"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <ExercisePrescriptionFields
            exerciseId={exercise.exerciseId}
            excludeIds={sessionExerciseIds}
            value={exercise}
            onPatch={onPatch}
          />
          <Button
            type="button"
            onClick={() => setEditing(false)}
            className="w-full"
          >
            Atualizar
          </Button>
        </div>
      )}
    </div>
  );
}
