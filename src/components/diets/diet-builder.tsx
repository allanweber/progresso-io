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
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { FoodPicker, type PickedFood } from "@/components/foods/food-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import {
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

type SubDraft = {
  key: string;
  foodId: string;
  description: string;
  grams: number;
  per100: Macro;
};

type ItemDraft = {
  key: string;
  foodId: string;
  description: string;
  grams: number;
  per100: Macro;
  substitutes: SubDraft[];
};

type MealDraft = {
  key: string;
  name: string;
  time: string;
  items: ItemDraft[];
};

type Draft = { name: string; notes: string; meals: MealDraft[] };

const newKey = () => crypto.randomUUID();

/**
 * Keep only digits and format a meal time as `HH:MM` while typing (e.g. "0800"
 * → "08:00"). The field accepts numbers only — any other character is dropped.
 */
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
        per100: per100From(it.macros, it.grams),
        substitutes: it.substitutes.map((s) => ({
          key: newKey(),
          foodId: s.foodId,
          description: s.description,
          grams: s.grams,
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
}: {
  mode: "create" | "edit";
  diet?: DietDetailDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const storageKey = `diet-draft:${mode === "edit" ? diet!.id : "new"}`;

  const [meals, setMeals] = useState<MealDraft[]>(() => initialDraft(diet).meals);
  const [mealErrors, setMealErrors] = useState<Record<string, string>>({});
  const [recovered, setRecovered] = useState(false);
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
      // Validate the tree that TanStack Form doesn't own.
      const errs: Record<string, string> = {};
      for (const m of meals) {
        if (!m.name.trim()) errs[m.key] = "Informe o nome da refeição.";
      }
      setMealErrors(errs);
      if (Object.keys(errs).length > 0) return;

      const payload = {
        name: value.name,
        notes: value.notes,
        meals: meals.map((m) => ({
          name: m.name.trim(),
          time: m.time.trim() === "" ? null : m.time.trim(),
          items: m.items.map((it) => ({
            foodId: it.foodId,
            grams: it.grams,
            substitutes: it.substitutes.map((s) => ({
              foodId: s.foodId,
              grams: s.grams,
            })),
          })),
        })),
      };
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

  // Recover a locally-saved draft on mount (client only — no SSR localStorage).
  useEffect(() => {
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
    if (!dirtyRef.current) return;
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
    router.push(mode === "edit" ? `/coach/diets/${diet!.id}` : "/coach/diets");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="mx-auto max-w-3xl pb-24"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={cancel}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Cancelar
        </button>
        <div className="flex items-center gap-2">
          {recovered && (
            <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
              Descartar rascunho
            </Button>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            <Save className="size-4" />
            {mutation.isPending ? "Salvando…" : "Salvar dieta"}
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
                <p className="text-[13px] text-destructive">{fieldError(field)}</p>
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
  onItems,
}: {
  meal: MealDraft;
  error?: string;
  sensors: ReturnType<typeof useSensors>;
  onNameChange: (name: string) => void;
  onTimeChange: (time: string) => void;
  onRemove: () => void;
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

  function addItem(food: PickedFood, grams: number) {
    onItems((items) => [
      ...items,
      {
        key: newKey(),
        foodId: food.id,
        description: food.description,
        grams,
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
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remover refeição"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
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
                    onGrams={(grams) =>
                      onItems((items) =>
                        items.map((i) =>
                          i.key === item.key ? { ...i, grams } : i,
                        ),
                      )
                    }
                    onRemove={() =>
                      onItems((items) => items.filter((i) => i.key !== item.key))
                    }
                    onAddSub={(food, grams) =>
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
            onPick={({ food, grams }) => addItem(food, grams ?? 100)}
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
  onGrams,
  onRemove,
  onAddSub,
  onRemoveSub,
}: {
  item: ItemDraft;
  onGrams: (grams: number) => void;
  onRemove: () => void;
  onAddSub: (food: PickedFood, grams: number) => void;
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
  const kcal = itemMacros(item.per100, item.grams).energyKcal;

  // Catalog substitutes for this item's food, fetched only when adding an
  // equivalence, shown as suggestions (grams scaled to this item's grams).
  const { data: catalog } = useQuery({
    queryKey: ["food", item.foodId],
    queryFn: () => apiFetch<FoodDetailDto>(`/api/foods/${item.foodId}`),
    enabled: addingSub,
    staleTime: 5 * 60_000,
  });
  const suggestions = (catalog?.substitutes ?? []).map((s) => ({
    foodId: s.foodId,
    description: s.description,
    code: s.code,
    grams: Math.round((s.grams * item.grams) / 100),
  }));

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
          aria-label="Reordenar alimento"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {item.description}
        </span>
        <div className="flex items-center gap-1">
          <Input
            inputMode="numeric"
            value={String(item.grams)}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              onGrams(v === "" ? 0 : parseInt(v, 10));
            }}
            className="h-8 w-16 text-center"
            aria-label="Gramas"
          />
          <span className="text-xs text-muted-foreground">g</span>
        </div>
        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
          {formatKcal(kcal)} kcal
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover alimento"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>

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
              <span className="shrink-0 text-muted-foreground">{s.grams} g</span>
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
            onPick={({ food, grams }) => {
              onAddSub(food, grams ?? item.grams);
              setAddingSub(false);
            }}
            onClose={() => setAddingSub(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingSub(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            <Plus className="size-3.5" />
            Equivalência
          </button>
        )}
      </div>
    </div>
  );
}
