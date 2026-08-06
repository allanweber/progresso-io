"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api-client";
import { fieldError } from "@/lib/form";
import {
  FOOD_TYPE_LABELS,
  foodFormSchema,
  type FoodGroupOption,
  type FoodMutationResponse,
  type FoodType,
} from "@/lib/foods";

/**
 * The one form used for creating and editing a food (the "enxuto" form — the six
 * hot macros only). It POSTs to the collection or PUTs to the item, both via
 * TanStack Query, validating with the same zod schema the API uses. Macro inputs
 * stay strings in form state; the schema coerces them (a decimal comma is
 * accepted) and empty becomes "não informado".
 *
 * It is endpoint-agnostic: the coach library and the admin base catalog both use
 * it, differing only in the `apiBase`, cache keys and redirect path passed in.
 */

/** The subset of a food the form seeds its fields from (edit mode). */
type FoodFormSource = {
  id: string;
  description: string;
  groupSlug: string;
  type: FoodType;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

type Values = {
  description: string;
  groupSlug: string;
  type: FoodType;
  energyKcal: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber: string;
  sodium: string;
};

const EMPTY: Values = {
  description: "",
  groupSlug: "",
  type: "ingrediente",
  energyKcal: "",
  protein: "",
  carbohydrate: "",
  fat: "",
  fiber: "",
  sodium: "",
};

/** A stored macro back to its input string ("12.3" → "12,3", null → ""). */
function macroStr(v: number | null): string {
  return v === null ? "" : String(v).replace(".", ",");
}

function toValues(food: FoodFormSource): Values {
  return {
    description: food.description,
    groupSlug: food.groupSlug,
    type: food.type,
    energyKcal: macroStr(food.energyKcal),
    protein: macroStr(food.protein),
    carbohydrate: macroStr(food.carbohydrate),
    fat: macroStr(food.fat),
    fiber: macroStr(food.fiber),
    sodium: macroStr(food.sodium),
  };
}

/** The six macro fields, in display order, with their unit hints. */
const MACROS: { name: keyof Values; label: string }[] = [
  { name: "energyKcal", label: "Energia (kcal)" },
  { name: "protein", label: "Proteína (g)" },
  { name: "carbohydrate", label: "Carboidrato (g)" },
  { name: "fat", label: "Gordura (g)" },
  { name: "fiber", label: "Fibra (g)" },
  { name: "sodium", label: "Sódio (mg)" },
];

export function FoodForm({
  mode,
  food,
  apiBase = "/api/foods",
  listKey = "foods",
  detailKey = "food",
  detailPath = "/coach/library/foods",
}: {
  mode: "create" | "edit";
  food?: FoodFormSource;
  /** API collection this form writes to (default: the coach's own foods). */
  apiBase?: string;
  /** TanStack Query list/detail keys to invalidate on success. */
  listKey?: string;
  detailKey?: string;
  /** Route the form navigates to after saving (`${detailPath}/${id}`). */
  detailPath?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: groups } = useQuery({
    queryKey: ["food-groups", apiBase],
    queryFn: () =>
      apiFetch<{ groups: FoodGroupOption[] }>(`${apiBase}/groups`).then(
        (r) => r.groups,
      ),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      apiFetch<FoodMutationResponse>(
        mode === "create" ? apiBase : `${apiBase}/${food!.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          body: JSON.stringify(values),
        },
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [listKey] });
      queryClient.invalidateQueries({ queryKey: [detailKey, data.food.id] });
      router.push(`${detailPath}/${data.food.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: food ? toValues(food) : EMPTY,
    validators: { onChange: foodFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  const serverErrors =
    mutation.error instanceof ApiError ? mutation.error.fieldErrors : undefined;
  const banner =
    mutation.error instanceof ApiError && !mutation.error.fieldErrors
      ? mutation.error.message
      : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-5"
    >
      {banner && (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      )}

      <form.Field name="description">
        {(field) => (
          <Field
            id="description"
            label="Nome do alimento"
            placeholder="Ex.: Whey protein (baunilha)"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            error={fieldError(field, serverErrors?.description)}
          />
        )}
      </form.Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="groupSlug">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="groupSlug">Grupo</Label>
              <select
                id="groupSlug"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={
                  fieldError(field, serverErrors?.groupSlug) ? true : undefined
                }
                className="flex h-11 w-full rounded-[10px] border-[1.5px] border-input bg-white px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-invalid:border-destructive"
              >
                <option value="" disabled>
                  Selecione um grupo…
                </option>
                {(groups ?? []).map((g) => (
                  <option key={g.slug} value={g.slug}>
                    {g.name}
                  </option>
                ))}
              </select>
              {fieldError(field, serverErrors?.groupSlug) && (
                <p className="text-[13px] text-destructive">
                  {fieldError(field, serverErrors?.groupSlug)}
                </p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="type">
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value as FoodType)}
                className="flex h-11 w-full rounded-[10px] border-[1.5px] border-input bg-white px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
              >
                {(["ingrediente", "preparacao"] as const).map((t) => (
                  <option key={t} value={t}>
                    {FOOD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          Composição por 100 g
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Deixe em branco o que não souber — o campo fica “não informado”.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {MACROS.map((m) => (
            <form.Field key={m.name} name={m.name}>
              {(field) => (
                <Field
                  id={m.name}
                  label={m.label}
                  inputMode="decimal"
                  placeholder="—"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  error={fieldError(field, serverErrors?.[m.name])}
                />
              )}
            </form.Field>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Salvando…"
            : mode === "create"
              ? "Adicionar alimento"
              : "Salvar alterações"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
