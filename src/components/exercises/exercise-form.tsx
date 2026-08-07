"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload, X } from "lucide-react";

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
  CATEGORY_OPTIONS,
  EQUIPMENT_OPTIONS,
  exerciseFormSchema,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseForce,
  type ExerciseLevel,
  type ExerciseMechanic,
  type ExerciseMutationResponse,
  exerciseImageUrl,
  FORCE_LABELS,
  LEVEL_OPTIONS,
  MECHANIC_LABELS,
  MUSCLE_OPTIONS,
  type Muscle,
} from "@/lib/exercises";

/**
 * The one form used to create and edit a custom exercise, shared by the coach
 * library and the admin base catalog (they differ only in the endpoints, cache
 * keys and redirect path). It POSTs to the collection or PUTs to the item, both
 * via TanStack Query, validating with the exact zod schema the API uses. Free
 * text is limited to name, description and the instruction steps; every other
 * field is a fixed enum (per the project rule). Images are uploaded to R2 first
 * (each returns a stored key), then saved with the exercise.
 */

const FORCE_OPTIONS = (Object.keys(FORCE_LABELS) as ExerciseForce[]).map((v) => ({
  value: v,
  label: FORCE_LABELS[v],
}));
const MECHANIC_OPTIONS = (Object.keys(MECHANIC_LABELS) as ExerciseMechanic[]).map(
  (v) => ({ value: v, label: MECHANIC_LABELS[v] }),
);
const MAX_IMAGES = 2;

/** Uploads one file to the R2 image endpoint and returns its stored key. */
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

/** The subset of an exercise the form seeds its fields from (edit mode). */
export type ExerciseFormSource = {
  id: string;
  name: string;
  description: string | null;
  category: ExerciseCategory;
  level: ExerciseLevel;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
  images: string[];
};

type Values = {
  name: string;
  description: string;
  category: ExerciseCategory | "";
  level: ExerciseLevel | "";
  force: ExerciseForce | "";
  mechanic: ExerciseMechanic | "";
  equipment: ExerciseEquipment | "";
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
  images: string[];
};

const EMPTY: Values = {
  name: "",
  description: "",
  category: "",
  level: "",
  force: "",
  mechanic: "",
  equipment: "",
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  images: [],
};

function toValues(e: ExerciseFormSource): Values {
  return {
    name: e.name,
    description: e.description ?? "",
    category: e.category,
    level: e.level,
    force: e.force ?? "",
    mechanic: e.mechanic ?? "",
    equipment: e.equipment ?? "",
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    instructions: e.instructions,
    images: e.images,
  };
}

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
  /** API collection this form writes to, e.g. "/api/exercises". */
  apiBase: string;
  /** Multipart image-upload endpoint, e.g. "/api/exercises/images". */
  imageEndpoint: string;
  /** TanStack Query list/detail keys to invalidate on success. */
  listKey: string;
  detailKey: string;
  /** Route the form navigates to after saving (`${detailPath}/${id}`). */
  detailPath: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Selected-but-not-yet-uploaded images: we keep the File objects in memory and
  // only upload them to R2 when the exercise is actually saved — so abandoning
  // the form, a failed validation, or removing an image before saving never
  // leaves an orphan object in the bucket.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);

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
      // Only reached once the form is valid. Upload the in-memory files now,
      // then save the exercise with the resulting keys plus any already-saved
      // ones — so nothing is written to R2 until the exercise itself is saved.
      let images = value.images;
      if (pendingFiles.length > 0) {
        setImageError(null);
        setUploadingImages(true);
        try {
          const keys: string[] = [];
          for (const file of pendingFiles) {
            keys.push(await uploadImage(imageEndpoint, file));
          }
          images = [...value.images, ...keys].slice(0, MAX_IMAGES);
        } catch (e) {
          setImageError(
            e instanceof Error ? e.message : "Falha ao enviar a imagem.",
          );
          return;
        } finally {
          setUploadingImages(false);
        }
      }
      try {
        await mutation.mutateAsync({ ...value, images });
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
      className="space-y-6"
    >
      {banner && (
        <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      )}

      {/* Images (up to two) — kept in memory, uploaded on save. */}
      <form.Field name="images">
        {(field) => {
          const total = field.state.value.length + pendingFiles.length;
          return (
            <ImageUploader
              existingKeys={field.state.value}
              pendingFiles={pendingFiles}
              canAdd={total < MAX_IMAGES}
              busy={uploadingImages}
              error={imageError}
              onAddFiles={(files) => {
                setImageError(null);
                const room = MAX_IMAGES - total;
                if (room <= 0) return;
                setPendingFiles((prev) => [...prev, ...files.slice(0, room)]);
              }}
              onRemoveExisting={(key) =>
                field.handleChange(
                  field.state.value.filter((k) => k !== key),
                )
              }
              onRemovePending={(idx) =>
                setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
              }
            />
          );
        }}
      </form.Field>

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

      <form.Field name="description">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Um resumo curto do exercício."
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {fieldError(field, serverErrors?.description) && (
              <p className="text-[13px] text-destructive">
                {fieldError(field, serverErrors?.description)}
              </p>
            )}
          </div>
        )}
      </form.Field>

      {/* Enum facets */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form.Field name="category">
          {(field) => {
            const err = fieldError(field, serverErrors?.category);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="category">Categoria</Label>
                <Select
                  value={field.state.value || undefined}
                  onValueChange={(v) =>
                    field.handleChange(v as ExerciseCategory)
                  }
                >
                  <SelectTrigger
                    id="category"
                    aria-invalid={err ? true : undefined}
                    className={err ? "border-destructive" : undefined}
                  >
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err && <p className="text-[13px] text-destructive">{err}</p>}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="level">
          {(field) => {
            const err = fieldError(field, serverErrors?.level);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="level">Nível</Label>
                <Select
                  value={field.state.value || undefined}
                  onValueChange={(v) => field.handleChange(v as ExerciseLevel)}
                >
                  <SelectTrigger
                    id="level"
                    aria-invalid={err ? true : undefined}
                    className={err ? "border-destructive" : undefined}
                  >
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err && <p className="text-[13px] text-destructive">{err}</p>}
              </div>
            );
          }}
        </form.Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <form.Field name="equipment">
          {(field) => (
            <OptionalSelect
              id="equipment"
              label="Equipamento"
              value={field.state.value}
              options={EQUIPMENT_OPTIONS}
              onChange={(v) => field.handleChange(v as ExerciseEquipment | "")}
            />
          )}
        </form.Field>
        <form.Field name="force">
          {(field) => (
            <OptionalSelect
              id="force"
              label="Força"
              value={field.state.value}
              options={FORCE_OPTIONS}
              onChange={(v) => field.handleChange(v as ExerciseForce | "")}
            />
          )}
        </form.Field>
        <form.Field name="mechanic">
          {(field) => (
            <OptionalSelect
              id="mechanic"
              label="Mecânica"
              value={field.state.value}
              options={MECHANIC_OPTIONS}
              onChange={(v) => field.handleChange(v as ExerciseMechanic | "")}
            />
          )}
        </form.Field>
      </div>

      {/* Muscles */}
      <form.Field name="primaryMuscles">
        {(field) => (
          <MusclePicker
            label="Músculos primários"
            selected={field.state.value}
            onToggle={(m) =>
              field.handleChange(
                field.state.value.includes(m)
                  ? field.state.value.filter((x) => x !== m)
                  : [...field.state.value, m],
              )
            }
          />
        )}
      </form.Field>
      <form.Field name="secondaryMuscles">
        {(field) => (
          <MusclePicker
            label="Músculos secundários"
            selected={field.state.value}
            onToggle={(m) =>
              field.handleChange(
                field.state.value.includes(m)
                  ? field.state.value.filter((x) => x !== m)
                  : [...field.state.value, m],
              )
            }
          />
        )}
      </form.Field>

      {/* Instructions (steps) */}
      <form.Field name="instructions" mode="array">
        {(field) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Como executar (passos)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => field.pushValue("")}
              >
                <Plus className="size-4" />
                Adicionar passo
              </Button>
            </div>
            {field.state.value.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nenhum passo. Adicione as instruções de execução, uma por passo.
              </p>
            ) : (
              <ol className="space-y-2">
                {field.state.value.map((_, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <form.Field name={`instructions[${i}]`}>
                      {(sub) => (
                        <Textarea
                          className="min-h-[44px] flex-1"
                          placeholder={`Passo ${i + 1}`}
                          value={sub.state.value}
                          onBlur={sub.handleBlur}
                          onChange={(e) => sub.handleChange(e.target.value)}
                        />
                      )}
                    </form.Field>
                    <button
                      type="button"
                      onClick={() => field.removeValue(i)}
                      aria-label={`Remover passo ${i + 1}`}
                      className="mt-2 shrink-0 rounded-full p-1.5 text-[#94A3B8] transition-colors hover:bg-destructive/10 hover:text-destructive"
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

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={mutation.isPending || uploadingImages}>
          {uploadingImages
            ? "Enviando imagens…"
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
          disabled={mutation.isPending || uploadingImages}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** An optional enum select (adds a "Nenhum" choice that maps to ""). Inline — used only here. */
function OptionalSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || "none"}
        onValueChange={(v) => onChange(v === "none" ? "" : v)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhum</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A grid of toggle chips for a set of muscles. Inline — used only in this form. */
function MusclePicker({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: Muscle[];
  onToggle: (m: Muscle) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {MUSCLE_OPTIONS.map((o) => {
          const active = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-full border border-primary bg-primary-light px-3 py-1.5 text-[13px] font-medium text-primary"
                  : "rounded-full border border-border bg-white px-3 py-1.5 text-[13px] text-[#475569] transition-colors hover:border-primary"
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Up to two image slots. Already-saved images are shown by their R2 key; newly
 * picked files are held in memory (with a local object-URL preview) and only
 * uploaded to R2 when the exercise is saved. Inline — used only here.
 */
function ImageUploader({
  existingKeys,
  pendingFiles,
  canAdd,
  busy,
  error,
  onAddFiles,
  onRemoveExisting,
  onRemovePending,
}: {
  existingKeys: string[];
  pendingFiles: File[];
  canAdd: boolean;
  busy: boolean;
  error: string | null;
  onAddFiles: (files: File[]) => void;
  onRemoveExisting: (key: string) => void;
  onRemovePending: (index: number) => void;
}) {
  // Local previews for the in-memory files; revoke them when they change / unmount.
  const previews = useMemo(
    () => pendingFiles.map((f) => URL.createObjectURL(f)),
    [pendingFiles],
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  return (
    <div className="space-y-2">
      <Label>Imagens (até {MAX_IMAGES})</Label>
      <p className="text-xs text-muted-foreground">
        As imagens são enviadas ao salvar o exercício.
      </p>
      <div className="flex flex-wrap gap-3">
        {existingKeys.map((key) => {
          const src = exerciseImageUrl(key);
          return (
            <div
              key={key}
              className="relative size-28 overflow-hidden rounded-2xl border border-border bg-surface-light"
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt="Imagem do exercício"
                  className="size-full object-cover"
                />
              ) : null}
              <button
                type="button"
                onClick={() => onRemoveExisting(key)}
                aria-label="Remover imagem"
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-[#475569] shadow transition-colors hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}

        {pendingFiles.map((file, idx) => (
          <div
            key={`${file.name}-${idx}`}
            className="relative size-28 overflow-hidden rounded-2xl border border-border bg-surface-light"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previews[idx]}
              alt={file.name}
              className="size-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemovePending(idx)}
              aria-label="Remover imagem"
              className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-[#475569] shadow transition-colors hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}

        {canAdd && (
          <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-white text-[12px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Upload className="size-5" />
            {busy ? "Enviando…" : "Adicionar"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                onAddFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
