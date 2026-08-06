"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import {
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  exerciseImageUrl,
  FORCE_LABELS,
  LEVEL_LABELS,
  MECHANIC_LABELS,
  MUSCLE_LABELS,
  ORIGIN_LABELS,
  type ExerciseDetailDto,
} from "@/lib/exercises";

/** Detail DTO plus the admin-only clinic name (absent for the coach). */
type Detail = ExerciseDetailDto & { clinicName?: string | null };

/**
 * The exercise detail view — image gallery, facets and step-by-step
 * instructions. Reused by the coach library and the admin catalog; they differ
 * only in the API endpoint and the back link.
 */
export function ExerciseDetail({
  apiBase,
  backHref,
}: {
  /** API detail endpoint base, e.g. "/api/exercises". */
  apiBase: string;
  /** Where the "back" link points, e.g. "/coach/library/exercises". */
  backHref: string;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [apiBase, id],
    queryFn: () => apiFetch<Detail>(`${apiBase}/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar aos exercícios
      </Link>

      {isLoading ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando exercício…
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data ? (
        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {data.name}
            </h1>
            {data.origin === "clinic" && (
              <Badge variant="clinic" className="font-medium">
                {ORIGIN_LABELS.clinic}
              </Badge>
            )}
          </div>
          {data.clinicName && (
            <p className="mt-1 text-sm text-muted-foreground">{data.clinicName}</p>
          )}

          {/* Facets */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="neutral" className="font-medium">
              {CATEGORY_LABELS[data.category]}
            </Badge>
            <Badge variant="base" className="font-medium">
              {LEVEL_LABELS[data.level]}
            </Badge>
            {data.equipment && (
              <Badge variant="neutral" className="font-medium">
                {EQUIPMENT_LABELS[data.equipment]}
              </Badge>
            )}
            {data.force && (
              <Badge variant="neutral" className="font-medium">
                {FORCE_LABELS[data.force]}
              </Badge>
            )}
            {data.mechanic && (
              <Badge variant="neutral" className="font-medium">
                {MECHANIC_LABELS[data.mechanic]}
              </Badge>
            )}
          </div>

          {/* Image gallery */}
          {data.images.length > 0 && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.images.map((key) => {
                const src = exerciseImageUrl(key);
                if (!src) return null;
                return (
                  <div
                    key={key}
                    className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface-light"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={data.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Muscles */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              <h2 className="text-sm font-semibold text-foreground">
                Músculos primários
              </h2>
              <p className="mt-1 text-[13px] text-[#475569]">
                {data.primaryMuscles.length > 0
                  ? data.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")
                  : "—"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
              <h2 className="text-sm font-semibold text-foreground">
                Músculos secundários
              </h2>
              <p className="mt-1 text-[13px] text-[#475569]">
                {data.secondaryMuscles.length > 0
                  ? data.secondaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")
                  : "—"}
              </p>
            </div>
          </div>

          {/* Instructions */}
          {data.instructions.length > 0 && (
            <div className="mt-6">
              <h2 className="font-heading text-lg font-bold text-foreground">
                Como executar
              </h2>
              <ol className="mt-3 space-y-3">
                {data.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <p className="text-sm leading-relaxed text-[#334155]">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </article>
      ) : null}
    </div>
  );
}
