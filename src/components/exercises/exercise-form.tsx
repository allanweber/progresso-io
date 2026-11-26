"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, X } from "lucide-react";

import { ExerciseThumb } from "@/components/exercises/exercise-media";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
  BODY_PART_OPTIONS,
  CATEGORY_OPTIONS,
  EQUIPMENT_OPTIONS,
  MACHINE_KIND_OPTIONS,
  NEED_OPTIONS,
  SECONDARY_MUSCLE_OPTIONS,
  TARGET_OPTIONS,
  exerciseFormSchema,
  isMachineEquipment,
  type ExerciseBodyPart,
  type ExerciseCategory,
  type ExerciseDetailDto,
  type ExerciseEquipment,
  type ExerciseMachineKind,
  type ExerciseMutationResponse,
  type ExerciseNeed,
  type ExerciseSecondaryMuscle,
  type ExerciseTarget,
} from "@/lib/exercises";
import { cn } from "@/lib/utils";

async function uploadImage(endpoint: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(endpoint, { method: "POST", body });
  const data = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : null;
  if (!res.ok) throw new Error(data?.error ?? "Falha ao enviar a imagem.");
  return data.key as string;
}

export type ExerciseFormSource = Pick<
  ExerciseDetailDto,
  | "id"
  | "name"
  | "nameEn"
  | "description"
  | "descriptionEn"
  | "bodyPart"
  | "category"
  | "equipment"
  | "machineKind"
  | "target"
  | "secondaryMuscles"
  | "needs"
  | "hold"
  | "instructions"
  | "instructionsEn"
  | "image"
>;

type Values = {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  bodyPart: ExerciseBodyPart | "";
  category: ExerciseCategory | "";
  equipment: ExerciseEquipment | "";
  machineKind: ExerciseMachineKind | "";
  target: ExerciseTarget | "";
  secondaryMuscles: ExerciseSecondaryMuscle[];
  needs: ExerciseNeed[];
  hold: boolean;
  instructions: string[];
  instructionsEn: string[];
  image: string;
};

const EMPTY: Values = {
  name: "",
  nameEn: "",
  description: "",
  descriptionEn: "",
  bodyPart: "",
  category: "strength",
  equipment: "body weight",
  machineKind: "",
  target: "",
  secondaryMuscles: [],
  needs: [],
  hold: false,
  instructions: [],
  instructionsEn: [],
  image: "",
};

function toValues(e: ExerciseFormSource): Values {
  return {
    name: e.name,
    nameEn: e.nameEn ?? "",
    description: e.description ?? "",
    descriptionEn: e.descriptionEn ?? "",
    bodyPart: e.bodyPart,
    category: e.category,
    equipment: e.equipment,
    machineKind: e.machineKind ?? "",
    target: e.target,
    secondaryMuscles: e.secondaryMuscles,
    needs: e.needs,
    hold: e.hold,
    instructions: e.instructions,
    instructionsEn: e.instructionsEn,
    image: e.image ?? "",
  };
}

const CHIP_ON =
  "rounded-full border border-primary bg-primary-light px-3 py-1.5 text-body-dense font-medium text-primary";
const CHIP_OFF =
  "rounded-full border border-border bg-card px-3 py-1.5 text-body-dense text-text-secondary transition-colors hover:border-primary";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

const ChipGroup = memo(function ChipGroup<T extends string>({
  label,
  options,
  value,
  error,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | T[] | "";
  error?: string;
  onChange: (value: never) => void;
}) {
  const change = onChange as (value: T | T[]) => void;
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((o) => {
          const active = Array.isArray(value) ? value.includes(o.value) : value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => change(Array.isArray(value) ? toggle(value, o.value) : o.value)}
              className={active ? CHIP_ON : CHIP_OFF}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-body-dense text-destructive">{error}</p>}
    </div>
  );
});

const SelectField = memo(function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  error?: string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger
          id={id}
          aria-invalid={error ? true : undefined}
          className={error ? "border-destructive" : undefined}
        >
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-body-dense text-destructive">{error}</p>}
    </div>
  );
}) as <T extends string>(props: {
  id: string;
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  error?: string;
  onChange: (v: T) => void;
}) => React.ReactElement;

export function ExerciseForm({
  mode,
  exercise,
  apiBase,
  imageEndpoint,
  listKey,
  detailKey,
  detailPath,
}: {
  mode: "create" | "edit";
  exercise?: ExerciseFormSource;
  apiBase: string;
  imageEndpoint: string;
  listKey: string;
  detailKey: string;
  detailPath: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const preview = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  );
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      apiFetch<ExerciseMutationResponse>(
        mode === "create" ? apiBase : `${apiBase}/${exercise!.id}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          body: JSON.stringify(values),
        },
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [listKey] });
      queryClient.invalidateQueries({ queryKey: [detailKey, data.exercise.id] });
      router.push(`${detailPath}/${data.exercise.id}`);
      router.refresh();
    },
  });

  const form = useForm({
    defaultValues: exercise ? toValues(exercise) : EMPTY,
    validators: { onChange: exerciseFormSchema },
    onSubmit: async ({ value }) => {
      let image = value.image;
      if (pendingFile) {
        setImageError(null);
        setUploading(true);
        try {
          image = await uploadImage(imageEndpoint, pendingFile);
        } catch (e) {
          setImageError(e instanceof Error ? e.message : "Falha ao enviar a imagem.");
          return;
        } finally {
          setUploading(false);
        }
      }
      try {
        await mutation.mutateAsync({ ...value, image });
      } catch {
        return;
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
      className="space-y-6"
    >
      {banner && (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-body-dense font-medium text-destructive">
          {banner}
        </div>
      )}

      <form.Field name="image">
        {(field) => (
          <div className="space-y-2">
            <Label>Foto (opcional)</Label>
            <p className="text-xs text-muted-foreground">A foto é enviada ao salvar o exercício.</p>
            <div className="flex flex-wrap gap-3">
              {(preview || field.state.value) && (
                <div className="relative size-28 overflow-hidden rounded-2xl border border-border">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Foto do exercício" className="size-full object-cover" />
                  ) : (
                    <ExerciseThumb image={field.state.value} className="size-full" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      field.handleChange("");
                    }}
                    aria-label="Remover foto"
                    className="absolute right-1 top-1 rounded-full bg-card/90 p-1 text-text-secondary shadow transition-colors hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}
              {!preview && !field.state.value && (
                <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card text-label text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <Upload className="size-5" />
                  {uploading ? "Enviando…" : "Adicionar"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      setImageError(null);
                      setPendingFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {imageError && <p className="text-body-dense text-destructive">{imageError}</p>}
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="name">
          {(field) => (
            <Field
              id="name"
              label="Nome do exercício"
              placeholder="Ex.: Agachamento com halteres"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.name)}
            />
          )}
        </form.Field>
        <form.Field name="nameEn">
          {(field) => (
            <Field
              id="nameEn"
              label="Nome em inglês (opcional)"
              placeholder="Ex.: Dumbbell squat"
              lang="en"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field, serverErrors?.nameEn)}
            />
          )}
        </form.Field>
      </div>

      <form.Field name="bodyPart">
        {(field) => (
          <ChipGroup
            label="Região do corpo"
            options={BODY_PART_OPTIONS}
            value={field.state.value}
            error={fieldError(field, serverErrors?.bodyPart)}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="target">
          {(field) => (
            <SelectField
              id="target"
              label="Músculo principal"
              value={field.state.value}
              options={TARGET_OPTIONS}
              error={fieldError(field, serverErrors?.target)}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <SelectField
              id="category"
              label="Tipo de exercício"
              value={field.state.value}
              options={CATEGORY_OPTIONS}
              error={fieldError(field, serverErrors?.category)}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="equipment">
          {(field) => (
            <SelectField
              id="equipment"
              label="Equipamento"
              value={field.state.value}
              options={EQUIPMENT_OPTIONS}
              error={fieldError(field, serverErrors?.equipment)}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(s) => s.values.equipment}>
          {(equipment) =>
            equipment && isMachineEquipment(equipment) ? (
              <form.Field name="machineKind">
                {(field) => (
                  <SelectField
                    id="machineKind"
                    label="Máquina"
                    value={field.state.value}
                    options={MACHINE_KIND_OPTIONS}
                    error={fieldError(field, serverErrors?.machineKind)}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            ) : null
          }
        </form.Subscribe>
      </div>

      <form.Field name="secondaryMuscles">
        {(field) => (
          <ChipGroup
            label="Músculos secundários"
            options={SECONDARY_MUSCLE_OPTIONS}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      <div className="flex flex-wrap gap-6">
        <form.Field name="needs">
          {(field) => (
            <ChipGroup
              label="Precisa também de"
              options={NEED_OPTIONS}
              value={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="hold">
          {(field) => (
            <label className="flex h-11 cursor-pointer items-center gap-2 self-end text-sm text-foreground">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="size-4 accent-primary"
              />
              Exercício mantido por tempo (isometria)
            </label>
          )}
        </form.Field>
      </div>

      {(
        [
          ["description", "Descrição (opcional)", "pt-BR", "Um resumo curto do exercício."],
          ["descriptionEn", "Descrição em inglês (opcional)", "en", "A short summary of the exercise."],
        ] as const
      ).map(([name, label, lang, placeholder]) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <div className="space-y-1.5">
              <Label htmlFor={name}>{label}</Label>
              <Textarea
                id={name}
                lang={lang}
                placeholder={placeholder}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {fieldError(field, serverErrors?.[name]) && (
                <p className="text-body-dense text-destructive">
                  {fieldError(field, serverErrors?.[name])}
                </p>
              )}
            </div>
          )}
        </form.Field>
      ))}

      {(
        [
          ["instructions", "Como fazer (passos)", "pt-BR", "Passo"],
          ["instructionsEn", "Como fazer em inglês (opcional)", "en", "Step"],
        ] as const
      ).map(([list, title, lang, step]) => (
        <form.Field key={list} name={list} mode="array">
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label>{title}</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => field.pushValue("")}>
                  <Plus className="size-4" />
                  Adicionar passo
                </Button>
              </div>
              {field.state.value.length === 0 ? (
                <p className="text-body-dense text-muted-foreground">
                  Nenhum passo. Adicione as instruções de execução, uma por passo.
                </p>
              ) : (
                <ol className="space-y-2">
                  {field.state.value.map((_, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-body-dense font-semibold text-primary">
                        {i + 1}
                      </span>
                      <form.Field name={`${list}[${i}]`}>
                        {(sub) => (
                          <Textarea
                            className="min-h-[44px] flex-1"
                            placeholder={`${step} ${i + 1}`}
                            lang={lang}
                            value={sub.state.value}
                            onBlur={sub.handleBlur}
                            onChange={(e) => sub.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                      <button
                        type="button"
                        onClick={() => field.removeValue(i)}
                        aria-label={`Remover passo ${i + 1}${list === "instructionsEn" ? " em inglês" : ""}`}
                        className={cn(
                          "mt-2 shrink-0 rounded-full p-1.5 text-meta transition-colors hover:bg-destructive/10 hover:text-destructive",
                        )}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </form.Field>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={mutation.isPending || uploading}>
          {uploading
            ? "Enviando foto…"
            : mutation.isPending
              ? "Salvando…"
              : mode === "create"
                ? "Adicionar exercício"
                : "Salvar alterações"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={mutation.isPending || uploading}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
