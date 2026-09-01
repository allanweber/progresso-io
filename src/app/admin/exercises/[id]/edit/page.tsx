"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { ExerciseForm } from "@/components/exercises/exercise-form";
import type { AdminExerciseDetailDto } from "@/lib/admin";
import { apiFetch } from "@/lib/api-client";

export default function EditBaseExercisePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/admin/exercises", id],
    queryFn: () => apiFetch<AdminExerciseDetailDto>(`/api/admin/exercises/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/admin/exercises/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao exercício
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Editar exercício base
      </h1>

      {isLoading ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-destructive shadow-rest">
          {(error as Error).message}
        </div>
      ) : data && data.origin !== "base" ? (
        <div className="mt-6 rounded-xl border border-border bg-surface-light px-4 py-3 text-body-dense text-muted-foreground">
          Exercício próprio de uma clínica — somente leitura.
        </div>
      ) : data ? (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-rest">
          <ExerciseForm
            mode="edit"
            exercise={data}
            apiBase="/api/admin/exercises"
            imageEndpoint="/api/admin/exercises/images"
            listKey="/api/admin/exercises"
            detailKey="/api/admin/exercises"
            detailPath="/admin/exercises"
          />
        </div>
      ) : null}
    </div>
  );
}
