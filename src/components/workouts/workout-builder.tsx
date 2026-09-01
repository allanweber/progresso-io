"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HeartPulse,
  MessageSquareText,
  Pencil,
  Plus,
  Repeat,
  Save,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ExerciseImageButton } from "@/components/workouts/exercise-images";
import {
  ExercisePicker,
  type PickedExercise,
} from "@/components/workouts/exercise-picker";
import {
  ExercisePrescriptionFields,
  hasPrescriptionDetails,
  type CustomSubDraft,
  type PrescriptionDefaults,
  type PrescriptionDraft,
} from "@/components/workouts/exercise-prescription-fields";
import { NumberField } from "@/components/workouts/number-field";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import { CATEGORY_LABELS } from "@/lib/exercises";
import {
  SESSION_FOCUS_SUGGESTIONS,
  SESSION_POSITION_SUGGESTIONS,
  composeSessionName,
  formatReps,
  formatRest,
  resolveSets,
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
import { TechniqueBadge } from "@/components/workouts/technique-icon";
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

type SessionDraft = {
  key: string;
  name: string;
  exercises: ExerciseDraft[];
  /**
   * The ficha's séries/descanso padrão. Purely a client-side stamping tool: a
   * newly added exercise is created from it and then owns its own values, so
   * this never reaches the payload, the schema, or the aluno. `null` until the
   * first exercise seeds it.
   */
  defaults: PrescriptionDefaults | null;
};
type Draft = {
  name: string;
  notes: string;
  cardio: string;
  sessions: SessionDraft[];
};

/** The whole-tree payload the builder emits on save (matches `workoutFormSchema`). */
export type WorkoutBuilderPayload = {
  name: string;
  notes: string;
  cardio: string;
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

/**
 * The most-repeated séries/descanso pair in a ficha — the padrão an existing
 * workout was evidently built on, recovered so the row means something the
 * moment a coach opens a treino they wrote weeks ago.
 */
function inferDefaults(
  exercises: { sets: number; rest: number }[],
): PrescriptionDefaults | null {
  if (exercises.length === 0) return null;
  const tally = new Map<string, { value: PrescriptionDefaults; count: number }>();
  for (const x of exercises) {
    const key = `${x.sets}:${x.rest}`;
    const hit = tally.get(key);
    if (hit) hit.count += 1;
    else tally.set(key, { value: { sets: x.sets, rest: x.rest }, count: 1 });
  }
  let best: { value: PrescriptionDefaults; count: number } | null = null;
  for (const entry of tally.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best ? best.value : null;
}

function initialDraft(workout?: WorkoutDetailDto): Draft {
  if (!workout) return { name: "", notes: "", cardio: "", sessions: [] };
  return {
    name: workout.name,
    notes: workout.notes ?? "",
    cardio: workout.cardio ?? "",
    sessions: workout.sessions.map((s) => ({
      key: newKey(),
      name: s.name,
      defaults: inferDefaults(s.exercises),
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

/**
 * What a row should say about its super/giant-set block. The builder used to
 * print "encadeia com o próximo exercício" from the technique tag alone, so
 * tagging the LAST exercise of a ficha rendered a chain that `assignGroupIds`
 * had already dropped — the UI asserted something the payload did not contain.
 * These marks come from the real grouping pass, so the opener, the tail, and a
 * tag that formed no block at all each say the truth.
 */
type GroupMark =
  | { kind: "opener"; technique: WorkoutTechnique }
  | { kind: "tail"; technique: WorkoutTechnique }
  | { kind: "orphan" };

function groupMarks(exercises: ExerciseDraft[]): (GroupMark | null)[] {
  let n = 0;
  const grouped = assignGroupIds(exercises, () => `g${n++}`);
  return grouped.map((entry, i) => {
    const tech = entry.exercise.technique;
    if (isGroupingTechnique(tech)) {
      return entry.groupId
        ? { kind: "opener", technique: tech as WorkoutTechnique }
        : { kind: "orphan" };
    }
    if (!entry.groupId) return null;
    // The block's tail carries no technique of its own — inherit the opener's
    // so the second half of a bi-set is visible instead of silent.
    for (let j = i - 1; j >= 0; j--) {
      if (grouped[j].groupId !== entry.groupId) break;
      const t = grouped[j].exercise.technique;
      if (isGroupingTechnique(t)) {
        return { kind: "tail", technique: t as WorkoutTechnique };
      }
    }
    return null;
  });
}

const shellSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do treino.")
    .max(120, "Nome muito longo."),
  notes: z.string().max(2000, "Observações muito longas."),
  cardio: z.string().max(2000, "Cardio muito longo."),
});

/* -------------------------------------------------------------------------- */
/*  Confirmation for the actions that destroy work                             */
/* -------------------------------------------------------------------------- */

/**
 * Every control on this screen that throws work away routes through here. The
 * builder used to guard only `Cancelar` — the one action that loses nothing on
 * the server — with a native `confirm()`, whose OK/Cancel buttons are a trap
 * against a PT-BR question containing the word "Cancelar". Real buttons, named
 * after what they do.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Continuar editando",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [pending, setPending] = useState<null | "cancel" | "discard">(null);

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
    defaultValues: {
      name: workout?.name ?? "",
      notes: workout?.notes ?? "",
      cardio: workout?.cardio ?? "",
    },
    validators: { onChange: shellSchema },
    onSubmit: async ({ value }) => {
      setActionError(null);
      if (adapter) {
        await runAdapter("save");
        return;
      }
      const payload = buildPayload(value);
      if (!payload) return;
      const parsed = workoutFormSchema.safeParse(payload);
      if (!parsed.success) {
        setActionError(
          "Não foi possível salvar o treino. Revise os campos destacados.",
        );
        return;
      }
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
    cardio: string;
  }): WorkoutBuilderPayload | null {
    const errs: Record<string, string> = {};
    for (const s of sessions) {
      if (!s.name.trim()) errs[s.key] = "Informe o nome da ficha.";
    }
    setSessionErrors(errs);
    const missing = Object.keys(errs).length;
    if (missing > 0) {
      // The screen used to refuse in total silence: `Salvar` looked broken and
      // the only clue was an inline <p> potentially thousands of px away.
      setActionError(
        missing === 1
          ? "Nomeie a ficha sem nome antes de salvar."
          : `Nomeie as ${missing} fichas sem nome antes de salvar.`,
      );
      const firstKey = sessions.find((sess) => errs[sess.key])?.key;
      if (firstKey) {
        requestAnimationFrame(() => {
          const el = document.getElementById(fichaNameId(firstKey));
          el?.scrollIntoView({ block: "center" });
          (el as HTMLInputElement | null)?.focus({ preventScroll: true });
        });
      }
      return null;
    }
    return {
      name: value.name,
      notes: value.notes,
      cardio: value.cardio,
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
    setActionError(null);
    const payload = buildPayload(form.state.values);
    if (!payload) return;
    setBusy(kind);
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
        // A draft written before the ficha padrão existed has no `defaults` —
        // recover it from the exercises rather than dropping the row.
        const sessions = saved.sessions.map((s) => ({
          ...s,
          defaults: s.defaults ?? inferDefaults(s.exercises ?? []),
        }));
        form.setFieldValue("name", saved.name ?? "");
        form.setFieldValue("notes", saved.notes ?? "");
        form.setFieldValue("cardio", saved.cardio ?? "");
        /* eslint-disable react-hooks/set-state-in-effect */
        setSessions(sessions);
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
        cardio: form.state.values.cardio,
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
    updateSessions((prev) => [
      ...prev,
      { key: newKey(), name: "", exercises: [], defaults: null },
    ]);
  const patchSession = (key: string, patch: Partial<SessionDraft>) =>
    updateSessions((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  /** Renaming a ficha clears its error — the red border must not outlive the fix. */
  function renameSession(key: string, name: string) {
    patchSession(key, { name });
    setSessionErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActionError(null);
  }
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
    form.setFieldValue("cardio", fresh.cardio);
    setSessions(fresh.sessions);
    setRecovered(false);
    dirtyRef.current = false;
  }

  function cancel() {
    if (dirtyRef.current) {
      setPending("cancel");
      return;
    }
    leave();
  }

  /**
   * Leaving throws away the local draft too. It used not to: `Cancelar` cleared
   * `dirtyRef` but left `workout-draft:new` in storage, so the next `Novo treino`
   * resurrected the very work the coach had just discarded.
   */
  function leave() {
    dirtyRef.current = false;
    if (persistLocal) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
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
      onKeyDown={(e) => {
        // One <form> wraps the whole builder and `Salvar treino` is its only
        // submit button, so Enter anywhere used to save and navigate away
        // mid-build. Enter in a single-line field commits that field instead.
        if (e.key !== "Enter" || e.defaultPrevented) return;
        const el = e.target as HTMLElement;
        if (el.tagName !== "INPUT") return;
        e.preventDefault();
        (el as HTMLInputElement).blur();
      }}
      className="mx-auto max-w-3xl pb-24"
    >
      {/* Sticky so `Salvar treino` and its error banner are never off-screen
          together on a treino that runs thousands of px. The negative margin
          takes the bar past the card column's edges, so scrolled content passes
          under a solid bar instead of showing around a floating band. */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-light px-4 py-3 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1 text-body text-muted-foreground hover:text-foreground"
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
                onClick={() => setPending("discard")}
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
        <div className="mb-4 rounded-[10px] bg-amber-50 px-4 py-2.5 text-body-dense font-medium text-amber-700">
          Rascunho não salvo recuperado deste dispositivo.
        </div>
      )}
      {(serverBanner || actionError) && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive"
        >
          {serverBanner ?? actionError}
        </div>
      )}

      {/* Student workout (adapter) is always an unpublished draft in the builder
          — warn that saving/editing alone doesn't reach the aluno, only Publicar. */}
      {adapter && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-body-dense text-amber-800">
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
                <p className="text-body-dense text-destructive">{fieldError(field)}</p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <form.Field name="cardio">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="workout-cardio" className="flex items-center gap-2">
                <HeartPulse className="size-4 text-primary" />
                Cardio (opcional)
              </Label>
              <Textarea
                id="workout-cardio"
                rows={2}
                placeholder="Ex.: 30 min de esteira em Z2, 3x na semana, após o treino."
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  markDirty();
                }}
              />
              {fieldError(field) && (
                <p className="text-body-dense text-destructive">{fieldError(field)}</p>
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
                onNameChange={(name) => renameSession(session.key, name)}
                onRemove={() => removeSession(session.key)}
                onExercises={(updater) => patchExercises(session.key, updater)}
                onDefaults={(next, applyToAll) => {
                  patchSession(session.key, { defaults: next });
                  if (!applyToAll) return;
                  patchExercises(session.key, (ex) =>
                    ex.map((x) => ({
                      ...x,
                      // A pirâmide derives its séries from the sequence, so the
                      // padrão only moves its descanso.
                      sets: resolveSets(x.reps, next.sets),
                      rest: next.rest,
                    })),
                  );
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addSession}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-4 text-body font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-4" />
        Nova ficha
      </button>

      <ConfirmDialog
        open={pending === "cancel"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Sair sem salvar?"
        description="As alterações feitas desde o último salvamento serão perdidas."
        confirmLabel="Sair sem salvar"
        onConfirm={leave}
      />
      <ConfirmDialog
        open={pending === "discard"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Descartar o rascunho?"
        description="O rascunho deste treino será apagado. O aluno continua com a versão publicada mais recente."
        confirmLabel="Descartar rascunho"
        onConfirm={runDiscard}
      />
    </form>
  );
}

/** The dom id of a ficha's name field, so a validation error can focus it. */
const fichaNameId = (key: string) => `ficha-nome-${key}`;

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
  onDefaults,
}: {
  session: SessionDraft;
  error?: string;
  sensors: ReturnType<typeof useSensors>;
  onNameChange: (name: string) => void;
  onRemove: () => void;
  onExercises: (updater: (ex: ExerciseDraft[]) => ExerciseDraft[]) => void;
  onDefaults: (next: PrescriptionDefaults, applyToAll: boolean) => void;
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
  const [nameFocused, setNameFocused] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [undo, setUndo] = useState<{ exercise: ExerciseDraft; index: number } | null>(
    null,
  );
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const marks = useMemo(() => groupMarks(session.exercises), [session.exercises]);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  /**
   * Removing an exercise is the most frequent destructive act on the screen, so
   * it gets an undo strip rather than a dialog — a confirmation on every removal
   * would cost more than the mistake does.
   */
  function removeExercise(exercise: ExerciseDraft) {
    const index = session.exercises.findIndex((e) => e.key === exercise.key);
    onExercises((ex) => ex.filter((i) => i.key !== exercise.key));
    setUndo({ exercise, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function restoreExercise() {
    if (!undo) return;
    const { exercise, index } = undo;
    onExercises((ex) => {
      const next = ex.slice();
      next.splice(Math.min(index, next.length), 0, exercise);
      return next;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }

  // Visible while the ficha is still being set up, and again whenever the coach
  // returns to the name field — but retired once the ficha has exercises in it,
  // which is when they were pure noise (9 chips × every ficha, forever).
  const showChips = session.exercises.length === 0 || nameFocused;

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
    // The first exercise declares the ficha's padrão; every later one is
    // stamped from it. The picker stays open for the next search.
    if (!session.defaults) {
      onDefaults({ sets: prescription.sets, rest: prescription.rest }, false);
    }
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
              id={fichaNameId(session.key)}
              value={session.name}
              onChange={(e) => onNameChange(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={(e) => {
                // A suggestion chip must not make the chips vanish under the
                // pointer before the coach can pick a second one.
                const next = e.relatedTarget as Node | null;
                if (next && chipsRef.current?.contains(next)) return;
                setNameFocused(false);
              }}
              placeholder="Nome da ficha (ex.: Ficha A · Peito e Tríceps)"
              aria-invalid={error ? true : undefined}
              className={`flex-1 ${error ? "border-destructive" : ""}`}
            />
            <button
              type="button"
              onClick={() =>
                session.exercises.length > 0 ? setConfirmRemove(true) : onRemove()
              }
              aria-label="Remover ficha"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && <p className="text-body-dense text-destructive">{error}</p>}
          {showChips && (
            <div ref={chipsRef} className="space-y-1.5">
              {(
                [
                  ["position", SESSION_POSITION_SUGGESTIONS],
                  ["focus", SESSION_FOCUS_SUGGESTIONS],
                ] as const
              ).map(([group, options]) => (
                <div key={group} className="flex flex-wrap gap-1.5">
                  {options.map((option) => {
                    const active = session.name
                      .split(" · ")
                      .some((part) => part.trim() === option);
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        // Keep focus in the name field so the chips survive the
                        // click and a second group can still be picked.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          onNameChange(
                            composeSessionName(session.name, option, group),
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-label font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary-light text-primary"
                            : "border-border bg-surface-light text-[#475569] hover:border-primary hover:text-primary"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {session.defaults && (
            <SessionDefaultsRow
              defaults={session.defaults}
              exerciseCount={session.exercises.length}
              onApply={onDefaults}
            />
          )}
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
                {session.exercises.map((exercise, i) => (
                  <SortableExercise
                    key={exercise.key}
                    exercise={exercise}
                    mark={marks[i] ?? null}
                    defaults={session.defaults}
                    sessionExerciseIds={session.exercises.map((e) => e.exerciseId)}
                    onPatch={(patch) =>
                      onExercises((ex) =>
                        ex.map((i2) => (i2.key === exercise.key ? { ...i2, ...patch } : i2)),
                      )
                    }
                    onRemove={() => removeExercise(exercise)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {undo && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-[10px] bg-surface-light px-3 py-2 text-label text-[#475569]"
          >
            <span className="min-w-0 truncate">
              {undo.exercise.name} removido.
            </span>
            <button
              type="button"
              onClick={restoreExercise}
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary transition-colors hover:text-primary-deep"
            >
              <Undo2 className="size-3.5" aria-hidden />
              Desfazer
            </button>
          </div>
        )}

        {adding ? (
          <ExercisePicker
            excludeIds={session.exercises.map((e) => e.exerciseId)}
            defaults={session.defaults}
            onPick={({ exercise, prescription }) =>
              addExercise(exercise, prescription)
            }
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-body font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Adicionar exercício
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover esta ficha?"
        description={`${
          session.name.trim() || "A ficha"
        } e seus ${session.exercises.length} ${
          session.exercises.length === 1 ? "exercício" : "exercícios"
        } serão removidos do treino.`}
        confirmLabel="Remover ficha"
        cancelLabel="Manter ficha"
        onConfirm={onRemove}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ficha padrão — séries + descanso stamped onto new exercises                */
/* -------------------------------------------------------------------------- */

const defaultsInputClass =
  "h-11 w-full rounded-[10px] border-[1.5px] border-input bg-white px-3.5 py-2.5 text-center text-body tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";

/**
 * The ficha's séries/descanso padrão, stated once instead of retyped per
 * exercise. It is seeded by the first exercise the coach adds and stamped onto
 * every later one — and adjusting it offers to apply the new values to the
 * exercises already in the ficha, which is what a batch edit would have been
 * for. Nothing here is stored: each exercise keeps its own real séries and
 * descanso in the payload, so the aluno always reads the actual prescription.
 */
function SessionDefaultsRow({
  defaults,
  exerciseCount,
  onApply,
}: {
  defaults: PrescriptionDefaults;
  exerciseCount: number;
  onApply: (next: PrescriptionDefaults, applyToAll: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState(defaults.sets);
  const [rest, setRest] = useState(defaults.rest);
  // Unchecked by default: the popover's own copy says the padrão governs the
  // exercises you add NEXT, so rewriting the ones already prescribed has to be
  // something the coach asks for, never the default under that sentence.
  const [applyAll, setApplyAll] = useState(false);

  // Re-seed the editor from the ficha every time it opens, never mid-edit.
  function onOpenChange(next: boolean) {
    if (next) {
      setSets(defaults.sets);
      setRest(defaults.rest);
      setApplyAll(false);
    }
    setOpen(next);
  }

  const willApply = applyAll && exerciseCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
      <span className="text-label text-muted-foreground">Padrão da ficha</span>
      <span className="text-label font-semibold tabular-nums text-[#334155]">
        {defaults.sets} séries · {formatRest(defaults.rest)}
      </span>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-surface-light px-3 text-label font-medium text-[#475569] transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
          >
            <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
            Ajustar
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[19rem]">
          <p className="text-subtitle font-semibold text-foreground">
            Padrão da ficha
          </p>
          <p className="mt-0.5 text-label text-muted-foreground">
            Vale para os próximos exercícios que você adicionar aqui.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Séries</Label>
              <NumberField
                value={sets}
                onCommit={setSets}
                min={1}
                max={50}
                maxDigits={2}
                ariaLabel="Séries padrão da ficha"
                inputClassName={defaultsInputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descanso (s)</Label>
              <NumberField
                value={rest}
                onCommit={setRest}
                min={0}
                max={3600}
                step={15}
                maxDigits={4}
                ariaLabel="Descanso padrão da ficha"
                inputClassName={defaultsInputClass}
              />
            </div>
          </div>
          {exerciseCount > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-body-dense text-[#334155]">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[#059669]"
              />
              <span>
                Também aplicar {exerciseCount === 1 ? "ao" : "aos"}{" "}
                {exerciseCount} {exerciseCount === 1 ? "exercício" : "exercícios"}{" "}
                já {exerciseCount === 1 ? "prescrito" : "prescritos"} nesta ficha
                <span className="mt-0.5 block text-label text-muted-foreground">
                  Substitui as séries e o descanso que você ajustou neles.
                </span>
              </span>
            </label>
          )}
          <Button
            type="button"
            onClick={() => {
              onApply({ sets, rest }, willApply);
              setOpen(false);
            }}
            className="mt-3 w-full"
          >
            {willApply ? `Salvar e aplicar a ${exerciseCount}` : "Salvar padrão"}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable exercise row (with prescription editor + custom substitutes)      */
/* -------------------------------------------------------------------------- */

function SortableExercise({
  exercise,
  mark,
  defaults,
  sessionExerciseIds,
  onPatch,
  onRemove,
}: {
  exercise: ExerciseDraft;
  /** What this row truthfully is inside a super/giant-set block, if anything. */
  mark: GroupMark | null;
  defaults: PrescriptionDefaults | null;
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
        <ExerciseImageButton
          exerciseId={exercise.exerciseId}
          name={exercise.name}
          thumbnail={exercise.thumbnail}
          className="size-9 rounded-md"
        />
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-body font-medium text-foreground">
              {exercise.name}
            </span>
            {tech && <TechniqueBadge technique={exercise.technique} />}
          </span>
          {/* The collapsed row is the safety net for everything `Mais detalhes`
              hides: técnica has its badge above, carga and descanso are in the
              summary, and observação + substituições get these two marks. */}
          <span className="flex items-center gap-1.5 text-label text-muted-foreground">
            <span className="min-w-0 truncate">
              {exercise.sets}× {formatReps(exercise.reps)}
              {exercise.load ? ` · ${exercise.load}` : ""} ·{" "}
              {formatRest(exercise.rest)}
            </span>
            {exercise.note.trim() !== "" && (
              <span
                role="img"
                aria-label="Tem observação"
                title="Tem observação"
                className="shrink-0"
              >
                <MessageSquareText className="size-3.5" aria-hidden />
              </span>
            )}
            {exercise.customSubstitutes.length > 0 && (
              <span
                role="img"
                aria-label={`${exercise.customSubstitutes.length} substituição própria`}
                title="Substituições próprias"
                className="flex shrink-0 items-center gap-0.5 tabular-nums"
              >
                <Repeat className="size-3.5" aria-hidden />
                {exercise.customSubstitutes.length}
              </span>
            )}
          </span>
          {mark?.kind === "opener" && (
            <span
              className="mt-0.5 block text-label font-medium"
              style={{ color: techniqueInfo(mark.technique)?.color }}
            >
              ↓ sem descanso — encadeia com o próximo exercício
            </span>
          )}
          {mark?.kind === "tail" && (
            <span
              className="mt-0.5 block text-label font-medium"
              style={{ color: techniqueInfo(mark.technique)?.color }}
            >
              ↑ em sequência com o anterior — sem descanso entre eles
            </span>
          )}
          {mark?.kind === "orphan" && (
            <span className="mt-0.5 block text-label font-medium text-amber-700">
              Sem efeito aqui — não há exercício seguinte para encadear.
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
            defaults={defaults}
            defaultDetailsOpen={hasPrescriptionDetails(exercise, defaults)}
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
