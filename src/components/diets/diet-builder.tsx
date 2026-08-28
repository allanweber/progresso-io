"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Clock,
  Copy,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { FoodPicker, type PickedFood } from "@/components/foods/food-picker";
import {
  QuantityEditor,
  type PickedMeasure,
} from "@/components/foods/quantity-editor";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import {
  DIET_MEALS_MAX,
  MEAL_NAME_MAX,
  MEAL_SUGGESTIONS,
  dietFormSchema,
  formatGrams,
  formatKcal,
  type DietDetailDto,
  type DietMutationResponse,
} from "@/lib/diets";
import type { FoodDetailDto } from "@/lib/foods";
import { z } from "@/lib/validation";

/* -------------------------------------------------------------------------- */
/*  Draft model (client state) — per-100 g macros kept so totals stay live     */
/* -------------------------------------------------------------------------- */

type Macro = {
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
};

export type SubDraft = {
  key: string;
  foodId: string;
  description: string;
  grams: number;
  measureLabel: string | null;
  measureGrams: number | null;
  per100: Macro;
};

export type ItemDraft = {
  key: string;
  foodId: string;
  description: string;
  grams: number;
  measureLabel: string | null;
  measureGrams: number | null;
  per100: Macro;
  substitutes: SubDraft[];
};

export type MealDraft = {
  key: string;
  name: string;
  time: string;
  items: ItemDraft[];
};

type Draft = { name: string; notes: string; meals: MealDraft[] };

/** The whole-tree payload the builder emits on save (matches `dietFormSchema`). */
export type DietBuilderPayload = {
  name: string;
  notes: string;
  meals: {
    name: string;
    time: string | null;
    items: {
      foodId: string;
      grams: number;
      measureLabel: string | null;
      measureGrams: number | null;
      substitutes: {
        foodId: string;
        grams: number;
        measureLabel: string | null;
        measureGrams: number | null;
      }[];
    }[];
  }[];
};

/**
 * Drives a server-persisted draft (a student's diet) instead of the default
 * template create/edit flow. When present, the builder shows Salvar rascunho /
 * Publicar / Descartar and delegates persistence to these callbacks (each
 * throws to surface an error); the draft is NOT mirrored to localStorage since
 * the server holds it.
 */
export type DietBuilderAdapter = {
  onSave: (payload: DietBuilderPayload) => Promise<void>;
  onPublish: (payload: DietBuilderPayload) => Promise<void>;
  onDiscard: () => Promise<void>;
  onCancel: () => void;
  saveLabel?: string;
  publishLabel?: string;
};

const newKey = () => crypto.randomUUID();

/** The suffix a duplicated meal takes, matching the diet/anamnese copy flows. */
const MEAL_COPY_SUFFIX = " (cópia)";

/** "Almoço" → "Almoço (cópia)", trimmed so it still fits {@link MEAL_NAME_MAX}. */
function copyMealName(name: string): string {
  const trimmed = name.trim();
  // A meal the coach hasn't named yet copies as unnamed — " (cópia)" alone
  // would be a name they never chose, and the save would reject it anyway.
  if (trimmed === "") return "";
  const base =
    trimmed.length + MEAL_COPY_SUFFIX.length > MEAL_NAME_MAX
      ? trimmed.slice(0, MEAL_NAME_MAX - MEAL_COPY_SUFFIX.length).trimEnd()
      : trimmed;
  return `${base}${MEAL_COPY_SUFFIX}`;
}

/**
 * Duplicates one meal — its foods, quantities, medidas caseiras and every
 * substitution — and drops the copy **directly below** the original, where a
 * coach building a week of similar meals expects it.
 *
 * Every key is regenerated, top to bottom. They are not cosmetic: the meal keys
 * are @dnd-kit's sortable ids and React's list keys, so a shared key between
 * the original and its copy would make dragging one move the other and let
 * React reuse the wrong row's state. Nothing else is shared either — `per100`
 * is cloned rather than aliased, so editing the copy can never reach back into
 * the meal it came from.
 *
 * `nextKey` is injectable so tests can assert against stable ids.
 */
export function duplicateMealDraft(
  meals: MealDraft[],
  key: string,
  nextKey: () => string = newKey,
): MealDraft[] {
  const index = meals.findIndex((m) => m.key === key);
  if (index < 0 || meals.length >= DIET_MEALS_MAX) return meals;

  const source = meals[index];
  const copy: MealDraft = {
    key: nextKey(),
    name: copyMealName(source.name),
    time: source.time,
    items: source.items.map((item) => ({
      ...item,
      key: nextKey(),
      per100: { ...item.per100 },
      substitutes: item.substitutes.map((sub) => ({
        ...sub,
        key: nextKey(),
        per100: { ...sub.per100 },
      })),
    })),
  };

  return [...meals.slice(0, index + 1), copy, ...meals.slice(index + 1)];
}

/**
 * Keep only digits and format a meal time as `HH:MM` while typing (e.g. "0800"
 * → "08:00"). The field accepts numbers only — any other character is dropped.
 */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** "2 fatias · 50 g" when a measure was used, else "50 g". */
function quantityLabel(
  grams: number,
  measureLabel: string | null,
  measureGrams: number | null,
): string {
  if (measureLabel && measureGrams && measureGrams > 0) {
    const count = Math.round(grams / measureGrams);
    return `${count} ${measureLabel} · ${grams} g`;
  }
  return `${grams} g`;
}

function pickedToPer100(f: PickedFood | FoodDetailDto): Macro {
  return {
    energyKcal: f.energyKcal,
    protein: f.protein,
    carbohydrate: f.carbohydrate,
    fat: f.fat,
  };
}

/** Reverse the DAL's scaling (macros stored scaled to grams) back to per 100 g. */
function per100From(macros: Macro, grams: number): Macro {
  const back = (v: number | null) =>
    v === null || v === undefined || grams <= 0 ? v ?? null : (v * 100) / grams;
  return {
    energyKcal: back(macros.energyKcal),
    protein: back(macros.protein),
    carbohydrate: back(macros.carbohydrate),
    fat: back(macros.fat),
  };
}

function scale(per100: number | null, grams: number): number | null {
  if (per100 === null || per100 === undefined) return null;
  return (per100 * grams) / 100;
}

function itemMacros(per100: Macro, grams: number): Macro {
  return {
    energyKcal: scale(per100.energyKcal, grams),
    protein: scale(per100.protein, grams),
    carbohydrate: scale(per100.carbohydrate, grams),
    fat: scale(per100.fat, grams),
  };
}

function addMacro(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function sumMacros(list: Macro[]): Macro {
  return list.reduce<Macro>(
    (acc, m) => ({
      energyKcal: addMacro(acc.energyKcal, m.energyKcal),
      protein: addMacro(acc.protein, m.protein),
      carbohydrate: addMacro(acc.carbohydrate, m.carbohydrate),
      fat: addMacro(acc.fat, m.fat),
    }),
    { energyKcal: null, protein: null, carbohydrate: null, fat: null },
  );
}

/** Builds the initial draft from an existing diet (edit mode) or empty (create). */
function initialDraft(diet?: DietDetailDto): Draft {
  if (!diet) return { name: "", notes: "", meals: [] };
  return {
    name: diet.name,
    notes: diet.notes ?? "",
    meals: diet.meals.map((m) => ({
      key: newKey(),
      name: m.name,
      time: m.time ?? "",
      items: m.items.map((it) => ({
        key: newKey(),
        foodId: it.foodId,
        description: it.description,
        grams: it.grams,
        measureLabel: it.measureLabel,
        measureGrams: it.measureGrams,
        per100: per100From(it.macros, it.grams),
        substitutes: it.substitutes.map((s) => ({
          key: newKey(),
          foodId: s.foodId,
          description: s.description,
          grams: s.grams,
          measureLabel: s.measureLabel,
          measureGrams: s.measureGrams,
          per100: per100From(s.macros, s.grams),
        })),
      })),
    })),
  };
}

/** The scalar shell validated by TanStack Form (the tree is validated on save). */
const shellSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da dieta.")
    .max(120, "Nome muito longo."),
  notes: z.string().max(2000, "Observações muito longas."),
});

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function DietBuilder({
  mode,
  diet,
  adapter,
}: {
  mode: "create" | "edit";
  diet?: DietDetailDto;
  /** When set, drives a server-persisted draft (student diet) — see the type. */
  adapter?: DietBuilderAdapter;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The student draft lives on the server, so its local mirror is disabled.
  const persistLocal = !adapter;
  const storageKey = `diet-draft:${adapter ? "student" : mode === "edit" ? diet!.id : "new"}`;
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard">(null);

  const [meals, setMeals] = useState<MealDraft[]>(() => initialDraft(diet).meals);
  const [mealErrors, setMealErrors] = useState<Record<string, string>>({});
  const [recovered, setRecovered] = useState(false);
  // Render the drag-and-drop tree only after mount: @dnd-kit's sortable adds
  // client-only aria attributes that don't match the SSR HTML, so gating avoids
  // a hydration mismatch. The builder is auth-only and not SEO-relevant.
  const [mounted, setMounted] = useState(false);
  const dirtyRef = useRef(false);
  // A monotonically-increasing counter bumped on every edit, so the persist
  // effect fires even when only the (form-owned) name/notes change.
  const [rev, setRev] = useState(0);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setRev((r) => r + 1);
  }, []);

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      apiFetch<DietMutationResponse>(
        mode === "create" ? "/api/diets" : `/api/diets/${diet!.id}`,
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
      queryClient.invalidateQueries({ queryKey: ["diets"] });
      queryClient.invalidateQueries({ queryKey: ["diet", data.diet.id] });
      router.push(`/coach/diets/${data.diet.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: {
      name: diet?.name ?? "",
      notes: diet?.notes ?? "",
    },
    validators: { onChange: shellSchema },
    onSubmit: async ({ value }) => {
      // Enter/submit: the adapter (student diet) saves the draft; otherwise the
      // template create/edit path runs.
      if (adapter) {
        await runAdapter("save");
        return;
      }
      const payload = buildPayload(value);
      if (!payload) return;
      // Belt-and-suspenders: the API validates the same schema.
      const parsed = dietFormSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        await mutation.mutateAsync(parsed.data);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  /**
   * Validates the meal names (which TanStack Form doesn't own) and returns the
   * whole-tree payload, or null when a meal name is missing.
   */
  function buildPayload(value: {
    name: string;
    notes: string;
  }): DietBuilderPayload | null {
    const errs: Record<string, string> = {};
    for (const m of meals) {
      if (!m.name.trim()) errs[m.key] = "Informe o nome da refeição.";
    }
    setMealErrors(errs);
    if (Object.keys(errs).length > 0) return null;
    return {
      name: value.name,
      notes: value.notes,
      meals: meals.map((m) => ({
        name: m.name.trim(),
        time: m.time.trim() === "" ? null : m.time.trim(),
        items: m.items.map((it) => ({
          foodId: it.foodId,
          grams: it.grams,
          measureLabel: it.measureLabel,
          measureGrams: it.measureGrams,
          substitutes: it.substitutes.map((s) => ({
            foodId: s.foodId,
            grams: s.grams,
            measureLabel: s.measureLabel,
            measureGrams: s.measureGrams,
          })),
        })),
      })),
    };
  }

  /** Runs a student-diet action (save/publish) through the adapter callbacks. */
  async function runAdapter(kind: "save" | "publish") {
    if (!adapter) return;
    const payload = buildPayload(form.state.values);
    if (!payload) return;
    setBusy(kind);
    setActionError(null);
    try {
      await (kind === "save" ? adapter.onSave : adapter.onPublish)(payload);
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : "Não foi possível salvar.",
      );
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
      setActionError(
        e instanceof ApiError ? e.message : "Não foi possível descartar.",
      );
    } finally {
      setBusy(null);
    }
  }

  // Recover a locally-saved draft on mount (client only — no SSR localStorage).
  useEffect(() => {
    if (!persistLocal) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft;
      if (saved && Array.isArray(saved.meals)) {
        form.setFieldValue("name", saved.name ?? "");
        form.setFieldValue("notes", saved.notes ?? "");
        // Restoring a locally-saved draft is only possible after mount (no
        // localStorage during SSR), so this one-time sync from an external
        // system is the intended place for it.
        /* eslint-disable react-hooks/set-state-in-effect */
        setMeals(saved.meals);
        setRecovered(true);
        /* eslint-enable react-hooks/set-state-in-effect */
        dirtyRef.current = true;
      }
    } catch {
      /* corrupt draft — ignore */
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft whenever anything changes (debounced by the render cadence).
  useEffect(() => {
    if (!persistLocal || !dirtyRef.current) return;
    try {
      const draft: Draft = {
        name: form.state.values.name,
        notes: form.state.values.notes,
        meals,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* ignore storage errors (quota / private mode) */
    }
    // rev bumps on every edit; meals covers tree structure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, rev, storageKey]);

  // Warn on browser-level navigation (reload / close / URL bar) with unsaved work.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Flip to client-rendered after mount (see the `mounted` declaration).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  /* --- meal/item mutators (all mark the draft dirty) --------------------- */

  const updateMeals = useCallback(
    (updater: (prev: MealDraft[]) => MealDraft[]) => {
      setMeals((prev) => updater(prev));
      markDirty();
    },
    [markDirty],
  );

  const addMeal = () =>
    updateMeals((prev) => [
      ...prev,
      { key: newKey(), name: "", time: "", items: [] },
    ]);

  const patchMeal = (key: string, patch: Partial<MealDraft>) =>
    updateMeals((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );

  const removeMeal = (key: string) =>
    updateMeals((prev) => prev.filter((m) => m.key !== key));

  const duplicateMeal = (key: string) =>
    updateMeals((prev) => duplicateMealDraft(prev, key));

  const patchItems = (
    mealKey: string,
    updater: (items: ItemDraft[]) => ItemDraft[],
  ) =>
    updateMeals((prev) =>
      prev.map((m) =>
        m.key === mealKey ? { ...m, items: updater(m.items) } : m,
      ),
    );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onMealDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    updateMeals((prev) => {
      const from = prev.findIndex((m) => m.key === active.id);
      const to = prev.findIndex((m) => m.key === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  };

  const serverBanner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  const dietTotals = sumMacros(
    meals.flatMap((m) => m.items.map((it) => itemMacros(it.per100, it.grams))),
  );

  function discardDraft() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    const fresh = initialDraft(diet);
    form.setFieldValue("name", fresh.name);
    form.setFieldValue("notes", fresh.notes);
    setMeals(fresh.meals);
    setRecovered(false);
    dirtyRef.current = false;
  }

  function cancel() {
    if (dirtyRef.current && !confirm("Descartar as alterações não salvas?")) {
      return;
    }
    dirtyRef.current = false;
    if (adapter) {
      adapter.onCancel();
      return;
    }
    router.push(mode === "edit" ? `/coach/diets/${diet!.id}` : "/coach/diets");
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
                {busy === "save"
                  ? "Salvando…"
                  : (adapter.saveLabel ?? "Salvar rascunho")}
              </Button>
              <Button
                type="button"
                onClick={() => runAdapter("publish")}
                disabled={busy !== null}
                className="w-full sm:w-auto"
              >
                {busy === "publish"
                  ? "Publicando…"
                  : (adapter.publishLabel ?? "Publicar")}
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
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full sm:w-auto"
              >
                <Save className="size-4" />
                {mutation.isPending ? "Salvando…" : "Salvar dieta"}
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
        <div className="mb-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {serverBanner ?? actionError}
        </div>
      )}

      {/* Student diet (adapter) is always an unpublished draft in the builder —
          warn that saving/editing alone doesn't reach the aluno, only Publicar. */}
      {adapter && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-body-dense text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Só editar não basta.</span> Salvar
            mantém as alterações como rascunho — a dieta só fica disponível para
            o aluno depois que você clicar em{" "}
            <span className="font-semibold">Publicar</span>.
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <form.Field name="name">
          {(field) => (
            <Field
              id="diet-name"
              label="Nome da dieta"
              placeholder="Ex.: Cutting 1800 kcal"
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
              <Label htmlFor="diet-notes">Observações (opcional)</Label>
              <Textarea
                id="diet-notes"
                rows={2}
                placeholder="Orientações gerais, hidratação, horários…"
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

      {/* Live totals */}
      <TotalsBar label="Total da dieta" totals={dietTotals} />

      {/* Meals (drag to reorder) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onMealDragEnd}
      >
        <SortableContext
          items={meals.map((m) => m.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mt-4 space-y-4">
            {meals.map((meal) => (
              <SortableMeal
                key={meal.key}
                meal={meal}
                error={mealErrors[meal.key]}
                sensors={sensors}
                onNameChange={(name) => patchMeal(meal.key, { name })}
                onTimeChange={(time) => patchMeal(meal.key, { time })}
                onRemove={() => removeMeal(meal.key)}
                onDuplicate={
                  meals.length < DIET_MEALS_MAX
                    ? () => duplicateMeal(meal.key)
                    : undefined
                }
                onItems={(updater) => patchItems(meal.key, updater)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addMeal}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-4" />
        Adicionar refeição
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Totals bar                                                                 */
/* -------------------------------------------------------------------------- */

function TotalsBar({ label, totals }: { label: string; totals: Macro }) {
  const cells: { label: string; value: string; className: string }[] = [
    { label: "kcal", value: formatKcal(totals.energyKcal), className: "text-primary" },
    { label: "Prot", value: formatGrams(totals.protein), className: "text-blue-600" },
    {
      label: "Carb",
      value: formatGrams(totals.carbohydrate),
      className: "text-red-600",
    },
    { label: "Gord", value: formatGrams(totals.fat), className: "text-amber-600" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-border bg-white px-5 py-3 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <div className="flex flex-1 flex-wrap justify-end gap-x-5 gap-y-1">
        {cells.map((c) => (
          <span key={c.label} className="text-sm">
            <span className={`font-bold ${c.className}`}>{c.value}</span>{" "}
            <span className="text-xs text-muted-foreground">{c.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable meal card                                                         */
/* -------------------------------------------------------------------------- */

function SortableMeal({
  meal,
  error,
  sensors,
  onNameChange,
  onTimeChange,
  onRemove,
  onDuplicate,
  onItems,
}: {
  meal: MealDraft;
  error?: string;
  sensors: ReturnType<typeof useSensors>;
  onNameChange: (name: string) => void;
  onTimeChange: (time: string) => void;
  onRemove: () => void;
  /** Absent once the diet is at its meal cap — the copy would not save. */
  onDuplicate?: () => void;
  onItems: (updater: (items: ItemDraft[]) => ItemDraft[]) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: meal.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [adding, setAdding] = useState(false);

  const totals = sumMacros(meal.items.map((it) => itemMacros(it.per100, it.grams)));

  function addItem(food: PickedFood, grams: number, measure: PickedMeasure) {
    onItems((items) => [
      ...items,
      {
        key: newKey(),
        foodId: food.id,
        description: food.description,
        grams,
        measureLabel: measure?.label ?? null,
        measureGrams: measure?.grams ?? null,
        per100: pickedToPer100(food),
        substitutes: [],
      },
    ]);
    setAdding(false);
  }

  function onItemDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    onItems((items) => {
      const from = items.findIndex((i) => i.key === active.id);
      const to = items.findIndex((i) => i.key === over.id);
      return from < 0 || to < 0 ? items : arrayMove(items, from, to);
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
          aria-label="Reordenar refeição"
          className="mt-2 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-5" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input
              value={meal.name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nome da refeição"
              aria-invalid={error ? true : undefined}
              className={`flex-1 ${error ? "border-destructive" : ""}`}
            />
            <div className="relative w-32">
              <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={meal.time}
                onChange={(e) => onTimeChange(formatTimeInput(e.target.value))}
                inputMode="numeric"
                maxLength={5}
                placeholder="Horário"
                className="pl-8"
              />
            </div>
            {onDuplicate ? (
              <button
                type="button"
                onClick={onDuplicate}
                aria-label={`Duplicar refeição${meal.name.trim() ? ` ${meal.name.trim()}` : ""}`}
                title="Duplicar refeição"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Copy className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover refeição"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && <p className="text-body-dense text-destructive">{error}</p>}
          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-1.5">
            {MEAL_SUGGESTIONS.map((s) => (
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

      {/* Items */}
      <div className="space-y-2 p-4">
        {meal.items.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onItemDragEnd}
          >
            <SortableContext
              items={meal.items.map((i) => i.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {meal.items.map((item) => (
                  <SortableItem
                    key={item.key}
                    item={item}
                    onEdit={(grams, measure) =>
                      onItems((items) =>
                        items.map((i) =>
                          i.key === item.key
                            ? {
                                ...i,
                                grams,
                                measureLabel: measure?.label ?? null,
                                measureGrams: measure?.grams ?? null,
                              }
                            : i,
                        ),
                      )
                    }
                    onRemove={() =>
                      onItems((items) => items.filter((i) => i.key !== item.key))
                    }
                    onAddSub={(food, grams, measure) =>
                      onItems((items) =>
                        items.map((i) =>
                          i.key === item.key
                            ? {
                                ...i,
                                substitutes: [
                                  ...i.substitutes,
                                  {
                                    key: newKey(),
                                    foodId: food.id,
                                    description: food.description,
                                    grams,
                                    measureLabel: measure?.label ?? null,
                                    measureGrams: measure?.grams ?? null,
                                    per100: pickedToPer100(food),
                                  },
                                ],
                              }
                            : i,
                        ),
                      )
                    }
                    onRemoveSub={(subKey) =>
                      onItems((items) =>
                        items.map((i) =>
                          i.key === item.key
                            ? {
                                ...i,
                                substitutes: i.substitutes.filter(
                                  (s) => s.key !== subKey,
                                ),
                              }
                            : i,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {adding ? (
          <FoodPicker
            withQuantity
            onPick={({ food, grams, measure }) => addItem(food, grams ?? 100, measure)}
            onClose={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" />
            Adicionar alimento
          </button>
        )}

        {meal.items.length > 0 && (
          <div className="flex justify-end gap-4 border-t border-[#F1F5F9] pt-2 text-xs">
            <span>
              <span className="font-semibold text-primary">
                {formatKcal(totals.energyKcal)}
              </span>{" "}
              <span className="text-muted-foreground">kcal</span>
            </span>
            <span>
              <span className="font-semibold text-blue-600">
                {formatGrams(totals.protein)}
              </span>{" "}
              <span className="text-muted-foreground">Prot</span>
            </span>
            <span>
              <span className="font-semibold text-red-600">
                {formatGrams(totals.carbohydrate)}
              </span>{" "}
              <span className="text-muted-foreground">Carb</span>
            </span>
            <span>
              <span className="font-semibold text-amber-600">
                {formatGrams(totals.fat)}
              </span>{" "}
              <span className="text-muted-foreground">Gord</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sortable item row (with equivalence manager)                               */
/* -------------------------------------------------------------------------- */

function SortableItem({
  item,
  onEdit,
  onRemove,
  onAddSub,
  onRemoveSub,
}: {
  item: ItemDraft;
  onEdit: (grams: number, measure: PickedMeasure) => void;
  onRemove: () => void;
  onAddSub: (food: PickedFood, grams: number, measure: PickedMeasure) => void;
  onRemoveSub: (subKey: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [addingSub, setAddingSub] = useState(false);
  const [editing, setEditing] = useState(false);
  const kcal = itemMacros(item.per100, item.grams).energyKcal;

  // The item's food (measures + catalog substitutes). Fetched for every item so
  // the food's catalog substitutes can be surfaced while building; also feeds the
  // add-equivalence picker and the quantity editor.
  const { data: catalog } = useQuery({
    queryKey: ["food", item.foodId],
    queryFn: () => apiFetch<FoodDetailDto>(`/api/foods/${item.foodId}`),
    staleTime: 5 * 60_000,
  });
  const suggestions = (catalog?.substitutes ?? []).map((s) => ({
    foodId: s.foodId,
    description: s.description,
    code: s.code,
    grams: Math.round((s.grams * item.grams) / 100),
  }));

  // The food's catalog substitutes not already added as an equivalence — shown
  // as quick-add chips so the coach can see (and use) them while building.
  const addedFoodIds = new Set(item.substitutes.map((s) => s.foodId));
  const catalogSuggestions = (catalog?.substitutes ?? []).filter(
    (s) => !addedFoodIds.has(s.foodId),
  );
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  async function quickAddSuggestion(foodId: string, subGrams: number) {
    setAddingSuggestion(foodId);
    try {
      const detail = await apiFetch<FoodDetailDto>(`/api/foods/${foodId}`);
      const picked: PickedFood = {
        id: detail.id,
        description: detail.description,
        code: detail.code,
        origin: detail.origin,
        energyKcal: detail.energyKcal,
        protein: detail.protein,
        carbohydrate: detail.carbohydrate,
        fat: detail.fat,
      };
      const grams = Math.round((subGrams * item.grams) / 100) || item.grams;
      onAddSub(picked, grams, null);
    } finally {
      setAddingSuggestion(null);
    }
  }

  // A PickedFood built from the draft's stored per-100 g macros, so editing the
  // quantity needs no extra fetch for the numbers.
  const itemAsPicked: PickedFood = {
    id: item.foodId,
    description: item.description,
    code: null,
    origin: "base",
    energyKcal: item.per100.energyKcal,
    protein: item.per100.protein,
    carbohydrate: item.per100.carbohydrate,
    fat: item.per100.fat,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-surface-light/40 p-2.5"
    >
      {editing ? (
        catalog ? (
          <QuantityEditor
            food={itemAsPicked}
            measures={catalog.measures}
            initialGrams={item.grams}
            initialMeasure={
              item.measureLabel && item.measureGrams
                ? { label: item.measureLabel, grams: item.measureGrams }
                : null
            }
            confirmLabel="Salvar"
            backLabel="Cancelar"
            onBack={() => setEditing(false)}
            onConfirm={({ grams, measure }) => {
              onEdit(grams, measure);
              setEditing(false);
            }}
          />
        ) : (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Carregando…
          </div>
        )
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Reordenar alimento"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-sm font-medium text-foreground">
              {item.description}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {quantityLabel(item.grams, item.measureLabel, item.measureGrams)}
            </span>
          </button>
          <span className="shrink-0 text-right text-xs text-muted-foreground">
            {formatKcal(kcal)} kcal
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Editar quantidade"
            title="Editar"
            className="text-muted-foreground hover:text-primary"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover alimento"
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Equivalences */}
      {item.substitutes.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6">
          {item.substitutes.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-2 text-xs text-[#475569]"
            >
              <span className="text-amber-600">⇄</span>
              <span className="min-w-0 flex-1 truncate">{s.description}</span>
              <span className="shrink-0 text-muted-foreground">
                {quantityLabel(s.grams, s.measureLabel, s.measureGrams)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveSub(s.key)}
                aria-label="Remover equivalência"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 pl-6">
        {addingSub ? (
          <FoodPicker
            withQuantity
            initialGrams={item.grams}
            suggestions={suggestions}
            onPick={({ food, grams, measure }) => {
              onAddSub(food, grams ?? item.grams, measure);
              setAddingSub(false);
            }}
            onClose={() => setAddingSub(false)}
          />
        ) : (
          <>
            {/* Catalog substitutes for this food — visible while building; tap
                to add as an equivalence. */}
            {catalogSuggestions.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-muted-foreground">
                  Substitutos:
                </span>
                {catalogSuggestions.map((s) => (
                  <button
                    key={s.foodId}
                    type="button"
                    onClick={() => quickAddSuggestion(s.foodId, s.grams)}
                    disabled={addingSuggestion !== null}
                    title="Adicionar como equivalência"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-caption font-medium text-amber-700 transition-colors hover:border-amber-400 disabled:opacity-50"
                  >
                    {addingSuggestion === s.foodId ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    {s.description.split(",")[0]}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setAddingSub(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
            >
              <Plus className="size-3.5" />
              Equivalência
            </button>
          </>
        )}
      </div>
    </div>
  );
}
