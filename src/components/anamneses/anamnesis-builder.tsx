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
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

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
  ANAMNESIS_MASK_LABELS,
  ANAMNESIS_MASK_VALUES,
  ANAMNESIS_OBJECTIVE_LABELS,
  ANAMNESIS_QUESTION_TYPE_VALUES,
  ANAMNESIS_QUESTION_TYPE_LABELS,
  anamnesisFormSchema,
  type AnamnesisDetailDto,
  type AnamnesisMask,
  type AnamnesisModality,
  type AnamnesisMutationResponse,
  type AnamnesisObjective,
  type AnamnesisQuestionType,
} from "@/lib/anamneses";
import { z } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Draft model (client state)                                                 */
/* -------------------------------------------------------------------------- */

type QuestionDraft = {
  key: string;
  type: AnamnesisQuestionType;
  label: string;
  mask?: AnamnesisMask;
  min?: number;
  max?: number;
};
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
        mask: q.mask,
        min: q.min,
        max: q.max,
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
        questions: s.questions.map((q) => {
          const base = { key: q.key, type: q.type, label: q.label.trim() };
          // Masks only apply to short-text questions; drop them otherwise.
          if (q.type !== "short_text" || !q.mask) return base;
          return {
            ...base,
            mask: q.mask,
            ...(q.min != null ? { min: q.min } : {}),
            ...(q.max != null ? { max: q.max } : {}),
          };
        }),
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
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[10px] px-2 text-body text-muted-foreground transition-colors hover:text-foreground sm:h-9"
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
        <div className="mb-4 rounded-[10px] bg-warn-bg px-4 py-2.5 text-body-dense font-medium text-warn-fg">
          Rascunho não salvo recuperado deste dispositivo.
        </div>
      )}
      {serverBanner && (
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
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
                <p className="text-body-dense text-destructive">{fieldError(field)}</p>
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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-white py-4 text-body font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
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
  const [collapsed, setCollapsed] = useState(false);
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

  const titleId = `section-title-${section.key}`;
  const errorId = `${titleId}-error`;
  const bodyId = `section-body-${section.key}`;
  // A collapsed section that holds a validation error would hide the field the
  // coach is being asked to fix, so an error always wins over the toggle.
  const hasError =
    Boolean(error) || section.questions.some((q) => questionErrors[q.key]);
  const isCollapsed = collapsed && !hasError;

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
          aria-label={`Reordenar a seção ${section.title || "sem título"}`}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing sm:size-9"
        >
          <GripVertical className="size-5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex gap-2">
            {/* The input carries the section's name for a screen reader; the
                visible text is the value itself, so the label is sr-only
                rather than absent. */}
            <Label htmlFor={titleId} className="sr-only">
              Título da seção
            </Label>
            <Input
              id={titleId}
              value={section.title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Título da seção (ex.: Identificação)"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`min-w-0 flex-1 ${error ? "border-destructive" : ""}`}
            />
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!isCollapsed}
              aria-controls={bodyId}
              aria-label={
                isCollapsed
                  ? `Expandir a seção ${section.title || "sem título"}`
                  : `Recolher a seção ${section.title || "sem título"}`
              }
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:size-11"
            >
              {isCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remover a seção ${section.title || "sem título"}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive sm:size-11"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && (
            <p id={errorId} className="text-body-dense text-destructive">
              {error}
            </p>
          )}
          {isCollapsed && (
            <p className="text-label text-meta">
              {section.questions.length === 1
                ? "1 pergunta"
                : `${section.questions.length} perguntas`}
            </p>
          )}
        </div>
      </div>

      {/* Questions. Collapsing is what makes a seven-section anamnese navigable
          on a phone — expanded, this tree is thousands of pixels of scroll. */}
      <div id={bodyId} hidden={isCollapsed} className="space-y-2 p-4">
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
                {section.questions.map((question, index) => (
                  <SortableQuestion
                    key={question.key}
                    question={question}
                    index={index}
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
                          q.key === question.key
                            ? {
                                ...q,
                                type,
                                // Masks only apply to short text — drop otherwise.
                                ...(type !== "short_text"
                                  ? { mask: undefined, min: undefined, max: undefined }
                                  : {}),
                              }
                            : q,
                        ),
                      )
                    }
                    onMaskChange={(mask) =>
                      onQuestions((qs) =>
                        qs.map((q) =>
                          q.key === question.key
                            ? {
                                ...q,
                                mask,
                                // Only integer/decimal keep min/max.
                                ...(mask === "integer" || mask === "decimal"
                                  ? {}
                                  : { min: undefined, max: undefined }),
                              }
                            : q,
                        ),
                      )
                    }
                    onMinChange={(min) =>
                      onQuestions((qs) =>
                        qs.map((q) => (q.key === question.key ? { ...q, min } : q)),
                      )
                    }
                    onMaxChange={(max) =>
                      onQuestions((qs) =>
                        qs.map((q) => (q.key === question.key ? { ...q, max } : q)),
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
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border text-body font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:h-10"
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
  index,
  error,
  onLabelChange,
  onTypeChange,
  onMaskChange,
  onMinChange,
  onMaxChange,
  onRemove,
}: {
  question: QuestionDraft;
  index: number;
  error?: string;
  onLabelChange: (label: string) => void;
  onTypeChange: (type: AnamnesisQuestionType) => void;
  onMaskChange: (mask: AnamnesisMask | undefined) => void;
  onMinChange: (min: number | undefined) => void;
  onMaxChange: (max: number | undefined) => void;
  onRemove: () => void;
}) {
  // The format controls apply to short text only, and most short-text questions
  // never use one. Rendering the row unconditionally doubled the page and put a
  // 32px select on every question; it now opens on request and stays open for a
  // question that already carries a mask.
  const [formatOpen, setFormatOpen] = useState(Boolean(question.mask));
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

  const labelId = `question-${question.key}`;
  const errorId = `${labelId}-error`;
  // What to call this question when it has no text yet.
  const named = question.label.trim() || `pergunta ${index + 1}`;
  const showFormat = question.type === "short_text" && formatOpen;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[10px] border border-border bg-surface-light/40 p-2.5"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reordenar ${named}`}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing sm:size-9"
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          {/* Below sm the question text gets the full width on its own line —
              sharing it with a fixed-width select left ~110px, so a coach could
              not read the words they were typing. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor={labelId} className="sr-only">
              Texto da pergunta {index + 1}
            </Label>
            {/* `w-full` below sm, `flex-1` only from sm up: the wrapper is
                `flex-col` on a phone, where `flex-1` would grow along the
                vertical main axis and silently override the input's 44px
                height. */}
            <Input
              id={labelId}
              value={question.label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Texto da pergunta"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={`w-full min-w-0 sm:w-auto sm:flex-1 ${error ? "border-destructive" : ""}`}
            />
            <div className="flex items-center gap-2">
              <Select
                value={question.type}
                onValueChange={(v) => onTypeChange(v as AnamnesisQuestionType)}
              >
                <SelectTrigger
                  aria-label={`Tipo de resposta de ${named}`}
                  className="h-11 min-w-0 flex-1 sm:h-9 sm:w-32 sm:flex-none"
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

              {question.type === "short_text" && (
                <button
                  type="button"
                  onClick={() => {
                    if (formatOpen) onMaskChange(undefined);
                    setFormatOpen((open) => !open);
                  }}
                  aria-expanded={formatOpen}
                  aria-label={`Formato da resposta de ${named}`}
                  className={`flex h-11 shrink-0 items-center rounded-[10px] border px-3 text-label font-medium transition-colors sm:h-9 ${
                    question.mask
                      ? "border-primary text-primary-deep"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {question.mask
                    ? ANAMNESIS_MASK_LABELS[question.mask]
                    : "Formato"}
                </button>
              )}

              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remover ${named}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:size-9"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Mask + range, on request. */}
          {showFormat && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <Select
                value={question.mask ?? "none"}
                onValueChange={(v) =>
                  onMaskChange(v === "none" ? undefined : (v as AnamnesisMask))
                }
              >
                <SelectTrigger
                  aria-label={`Máscara da resposta de ${named}`}
                  className="h-11 w-full sm:h-9 sm:w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {ANAMNESIS_MASK_VALUES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ANAMNESIS_MASK_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(question.mask === "integer" || question.mask === "decimal") && (
                <>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="mín"
                    aria-label={`Valor mínimo de ${named}`}
                    value={question.min ?? ""}
                    onChange={(e) =>
                      onMinChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                    className="h-11 w-24 sm:h-9 sm:w-20"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="máx"
                    aria-label={`Valor máximo de ${named}`}
                    value={question.max ?? ""}
                    onChange={(e) =>
                      onMaxChange(
                        e.target.value === "" ? undefined : Number(e.target.value),
                      )
                    }
                    className="h-11 w-24 sm:h-9 sm:w-20"
                  />
                </>
              )}
            </div>
          )}

          {error && (
            <p id={errorId} className="text-body-dense text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
