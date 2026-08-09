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
import { ArrowLeft, GripVertical, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import {
  ANAMNESIS_MODALITY_VALUES,
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_VALUES,
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_QUESTION_TYPE_VALUES,
  ANAMNESIS_QUESTION_TYPE_LABELS,
  anamnesisFormSchema,
  type AnamnesisDetailDto,
  type AnamnesisModality,
  type AnamnesisMutationResponse,
  type AnamnesisObjective,
  type AnamnesisQuestionType,
} from "@/lib/anamneses";
import { z } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Draft model (client state)                                                 */
/* -------------------------------------------------------------------------- */

type QuestionDraft = { key: string; type: AnamnesisQuestionType; label: string };
type SectionDraft = { key: string; title: string; questions: QuestionDraft[] };
type Draft = {
  name: string;
  description: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: SectionDraft[];
};

/** The whole-tree payload the builder emits on save (matches `anamnesisFormSchema`). */
export type AnamnesisBuilderPayload = {
  name: string;
  description: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  sections: { key: string; title: string; questions: QuestionDraft[] }[];
};

const newKey = () => crypto.randomUUID();

/** Builds the initial draft from an existing anamnese (edit) or empty (create). */
function initialDraft(anamnesis?: AnamnesisDetailDto): Draft {
  if (!anamnesis) {
    return {
      name: "",
      description: "",
      objective: "health",
      modality: "any",
      sections: [],
    };
  }
  return {
    name: anamnesis.name,
    description: anamnesis.description ?? "",
    objective: anamnesis.objective,
    modality: anamnesis.modality,
    sections: anamnesis.sections.map((s) => ({
      key: newKey(),
      title: s.title,
      questions: s.questions.map((q) => ({
        key: newKey(),
        type: q.type,
        label: q.label,
      })),
    })),
  };
}

/** The scalar shell validated by TanStack Form (the tree is validated on save). */
const shellSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da anamnese.")
    .max(120, "Nome muito longo."),
  description: z.string().max(500, "Descrição muito longa."),
  objective: z.enum(ANAMNESIS_OBJECTIVE_VALUES),
  modality: z.enum(ANAMNESIS_MODALITY_VALUES),
});

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function AnamnesisBuilder({
  mode,
  anamnesis,
}: {
  mode: "create" | "edit";
  anamnesis?: AnamnesisDetailDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const storageKey = `anamnesis-draft:${mode === "edit" ? anamnesis!.id : "new"}`;

  const base = initialDraft(anamnesis);
  const [sections, setSections] = useState<SectionDraft[]>(base.sections);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
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
      apiFetch<AnamnesisMutationResponse>(
        mode === "create" ? "/api/anamneses" : `/api/anamneses/${anamnesis!.id}`,
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
        /* ignore storage errors */
      }
      queryClient.invalidateQueries({ queryKey: ["anamneses"] });
      queryClient.invalidateQueries({ queryKey: ["anamnesis", data.anamnesis.id] });
      router.push(`/coach/anamneses/${data.anamnesis.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: {
      name: base.name,
      description: base.description,
      objective: base.objective,
      modality: base.modality,
    },
    validators: { onChange: shellSchema },
    onSubmit: async ({ value }) => {
      const payload = buildPayload(value);
      if (!payload) return;
      const parsed = anamnesisFormSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        await mutation.mutateAsync(parsed.data);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  /** Validates section titles and returns the whole-tree payload, or null. */
  function buildPayload(value: {
    name: string;
    description: string;
    objective: AnamnesisObjective;
    modality: AnamnesisModality;
  }): AnamnesisBuilderPayload | null {
    const errs: Record<string, string> = {};
    for (const s of sections) {
      if (!s.title.trim()) errs[s.key] = "Informe o título da seção.";
      for (const q of s.questions) {
        if (!q.label.trim()) errs[q.key] = "Informe a pergunta.";
      }
    }
    setSectionErrors(errs);
    if (Object.keys(errs).length > 0) return null;
    return {
      name: value.name,
      description: value.description,
      objective: value.objective,
      modality: value.modality,
      sections: sections.map((s) => ({
        key: s.key,
        title: s.title.trim(),
        questions: s.questions.map((q) => ({
          key: q.key,
          type: q.type,
          label: q.label.trim(),
        })),
      })),
    };
  }

  // Recover a locally-saved draft on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      if (saved && Array.isArray(saved.sections)) {
        form.setFieldValue("name", saved.name ?? "");
        form.setFieldValue("description", saved.description ?? "");
        if (saved.objective) form.setFieldValue("objective", saved.objective);
        if (saved.modality) form.setFieldValue("modality", saved.modality);
        /* eslint-disable react-hooks/set-state-in-effect */
        setSections(saved.sections);
        setRecovered(true);
        /* eslint-enable react-hooks/set-state-in-effect */
        dirtyRef.current = true;
      }
    } catch {
      /* corrupt draft — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft whenever anything changes.
  useEffect(() => {
    if (!dirtyRef.current) return;
    try {
      const draft: Draft = {
        name: form.state.values.name,
        description: form.state.values.description,
        objective: form.state.values.objective,
        modality: form.state.values.modality,
        sections,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* ignore storage errors (quota / private mode) */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, rev, storageKey]);

  // Warn on browser-level navigation with unsaved work.
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

  /* --- section/question mutators (all mark the draft dirty) -------------- */

  const updateSections = useCallback(
    (updater: (prev: SectionDraft[]) => SectionDraft[]) => {
      setSections((prev) => updater(prev));
      markDirty();
    },
    [markDirty],
  );

  const addSection = () =>
    updateSections((prev) => [
      ...prev,
      { key: newKey(), title: "", questions: [] },
    ]);

  const patchSection = (key: string, patch: Partial<SectionDraft>) =>
    updateSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  const removeSection = (key: string) =>
    updateSections((prev) => prev.filter((s) => s.key !== key));

  const patchQuestions = (
    sectionKey: string,
    updater: (questions: QuestionDraft[]) => QuestionDraft[],
  ) =>
    updateSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey ? { ...s, questions: updater(s.questions) } : s,
      ),
    );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onSectionDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updateSections((prev) => {
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
    const fresh = initialDraft(anamnesis);
    form.setFieldValue("name", fresh.name);
    form.setFieldValue("description", fresh.description);
    form.setFieldValue("objective", fresh.objective);
    form.setFieldValue("modality", fresh.modality);
    setSections(fresh.sections);
    setRecovered(false);
    dirtyRef.current = false;
  }

  function cancel() {
    if (dirtyRef.current && !confirm("Descartar as alterações não salvas?")) {
      return;
    }
    dirtyRef.current = false;
    router.push(
      mode === "edit" ? `/coach/anamneses/${anamnesis!.id}` : "/coach/anamneses",
    );
  }

  // Before mount, render a minimal placeholder so the server HTML carries no
  // @dnd-kit client-only attributes to mismatch on hydration.
  if (!mounted) {
    return <div className="mx-auto max-w-3xl pb-24" aria-hidden />;
  }

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
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="w-full sm:w-auto"
          >
            <Save className="size-4" />
            {mutation.isPending ? "Salvando…" : "Salvar anamnese"}
          </Button>
        </div>
      </div>

      {recovered && (
        <div className="mb-4 rounded-[10px] bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-700">
          Rascunho não salvo recuperado deste dispositivo.
        </div>
      )}
      {serverBanner && (
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {serverBanner}
        </div>
      )}

      {/* Scalar shell */}
      <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <form.Field name="name">
          {(field) => (
            <Field
              id="anamnesis-name"
              label="Nome da anamnese"
              placeholder="Ex.: Anamnese — Emagrecimento (online)"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="objective">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="anamnesis-objective">Objetivo</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    field.handleChange(v as AnamnesisObjective);
                    markDirty();
                  }}
                >
                  <SelectTrigger id="anamnesis-objective" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANAMNESIS_OBJECTIVE_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {ANAMNESIS_OBJECTIVE_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="modality">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="anamnesis-modality">Modalidade</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    field.handleChange(v as AnamnesisModality);
                    markDirty();
                  }}
                >
                  <SelectTrigger id="anamnesis-modality" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANAMNESIS_MODALITY_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {ANAMNESIS_MODALITY_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>

        <form.Field name="description">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="anamnesis-description">Descrição (opcional)</Label>
              <Textarea
                id="anamnesis-description"
                rows={2}
                placeholder="Para quem é esta anamnese, quando usá-la…"
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

      {/* Sections (drag to reorder) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onSectionDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-4 space-y-4">
            {sections.map((section) => (
              <SortableSection
                key={section.key}
                section={section}
                error={sectionErrors[section.key]}
                questionErrors={sectionErrors}
                sensors={sensors}
                onTitleChange={(title) => patchSection(section.key, { title })}
                onRemove={() => removeSection(section.key)}
                onQuestions={(updater) => patchQuestions(section.key, updater)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addSection}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-4" />
        Adicionar seção
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable section card                                                      */
/* -------------------------------------------------------------------------- */

function SortableSection({
  section,
  error,
  questionErrors,
  sensors,
  onTitleChange,
  onRemove,
  onQuestions,
}: {
  section: SectionDraft;
  error?: string;
  questionErrors: Record<string, string>;
  sensors: ReturnType<typeof useSensors>;
  onTitleChange: (title: string) => void;
  onRemove: () => void;
  onQuestions: (updater: (questions: QuestionDraft[]) => QuestionDraft[]) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const addQuestion = () =>
    onQuestions((qs) => [
      ...qs,
      { key: newKey(), type: "short_text", label: "" },
    ]);

  function onQuestionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onQuestions((qs) => {
      const from = qs.findIndex((q) => q.key === active.id);
      const to = qs.findIndex((q) => q.key === over.id);
      return from < 0 || to < 0 ? qs : arrayMove(qs, from, to);
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
          aria-label="Reordenar seção"
          className="mt-2 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={section.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Título da seção (ex.: Identificação)"
              aria-invalid={error ? true : undefined}
              className={`flex-1 ${error ? "border-destructive" : ""}`}
            />
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover seção"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-2 p-4">
        {section.questions.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onQuestionDragEnd}
          >
            <SortableContext
              items={section.questions.map((q) => q.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {section.questions.map((question) => (
                  <SortableQuestion
                    key={question.key}
                    question={question}
                    error={questionErrors[question.key]}
                    onLabelChange={(label) =>
                      onQuestions((qs) =>
                        qs.map((q) =>
                          q.key === question.key ? { ...q, label } : q,
                        ),
                      )
                    }
                    onTypeChange={(type) =>
                      onQuestions((qs) =>
                        qs.map((q) =>
                          q.key === question.key ? { ...q, type } : q,
                        ),
                      )
                    }
                    onRemove={() =>
                      onQuestions((qs) => qs.filter((q) => q.key !== question.key))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <button
          type="button"
          onClick={addQuestion}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" />
          Adicionar pergunta
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable question row                                                      */
/* -------------------------------------------------------------------------- */

function SortableQuestion({
  question,
  error,
  onLabelChange,
  onTypeChange,
  onRemove,
}: {
  question: QuestionDraft;
  error?: string;
  onLabelChange: (label: string) => void;
  onTypeChange: (type: AnamnesisQuestionType) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

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
          aria-label="Reordenar pergunta"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <Input
          value={question.label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Texto da pergunta"
          aria-invalid={error ? true : undefined}
          className={`min-w-0 flex-1 ${error ? "border-destructive" : ""}`}
        />
        <Select
          value={question.type}
          onValueChange={(v) => onTypeChange(v as AnamnesisQuestionType)}
        >
          <SelectTrigger
            aria-label="Tipo da pergunta"
            className="h-9 w-32 shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANAMNESIS_QUESTION_TYPE_VALUES.map((v) => (
              <SelectItem key={v} value={v}>
                {ANAMNESIS_QUESTION_TYPE_LABELS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover pergunta"
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
      {error && <p className="mt-1 pl-6 text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
