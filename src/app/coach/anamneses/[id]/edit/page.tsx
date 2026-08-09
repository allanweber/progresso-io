"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AnamnesisBuilder } from "@/components/anamneses/anamnesis-builder";
import { apiFetch } from "@/lib/api-client";
import type { AnamnesisDetailDto } from "@/lib/anamneses";

export default function EditAnamnesisPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["anamnesis", id],
    queryFn: () => apiFetch<AnamnesisDetailDto>(`/api/anamneses/${id}`),
    retry: false,
  });

  return (
    <div>
      <h1 className="mx-auto mb-4 max-w-3xl font-heading text-2xl font-bold text-foreground">
        Editar anamnese
      </h1>

      {isLoading ? (
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : data ? (
        <AnamnesisBuilder mode="edit" anamnesis={data} />
      ) : null}
    </div>
  );
}
