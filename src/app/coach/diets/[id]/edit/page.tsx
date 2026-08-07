"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { DietBuilder } from "@/components/diets/diet-builder";
import { apiFetch } from "@/lib/api-client";
import type { DietDetailDto } from "@/lib/diets";

export default function EditDietPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["diet", id],
    queryFn: () => apiFetch<DietDetailDto>(`/api/diets/${id}`),
    retry: false,
  });

  return (
    <div>
      <h1 className="mx-auto mb-4 max-w-3xl font-heading text-2xl font-bold text-foreground">
        Editar dieta
      </h1>

      {isLoading ? (
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data && data.origin === "base" ? (
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Esta é uma dieta base e não pode ser editada.
        </div>
      ) : data ? (
        <DietBuilder mode="edit" diet={data} />
      ) : null}
    </div>
  );
}
