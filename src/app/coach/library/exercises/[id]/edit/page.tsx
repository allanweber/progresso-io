"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { ExerciseForm } from "@/components/exercises/exercise-form";
import { apiFetch } from "@/lib/api-client";
import type { ExerciseDetailDto } from "@/lib/exercises";

export default function EditExercisePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/exercises", id],
    queryFn: () => apiFetch<ExerciseDetailDto>(`/api/exercises/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/coach/library/exercises/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao exercício
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Editar exercício
      </h1>

      {isLoading ? (
        <div className="mt-6 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data && data.origin !== "clinic" ? (
        <div className="mt-6 rounded-xl border border-border bg-surface-light px-4 py-3 text-body-dense text-muted-foreground">
          Este é um exercício do catálogo base — somente leitura.
        </div>
      ) : data ? (
        <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <ExerciseForm
            mode="edit"
            exercise={data}
            apiBase="/api/exercises"
            imageEndpoint="/api/exercises/images"
            listKey="/api/exercises"
            detailKey="/api/exercises"
            detailPath="/coach/library/exercises"
          />
        </div>
      ) : null}
    </div>
  );
}
