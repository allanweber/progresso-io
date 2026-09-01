"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { FoodForm } from "@/components/foods/food-form";
import { apiFetch } from "@/lib/api-client";
import type { FoodDetailDto } from "@/lib/foods";

export default function EditFoodPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["food", id],
    queryFn: () => apiFetch<FoodDetailDto>(`/api/foods/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/coach/library/foods/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao alimento
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Editar alimento
      </h1>

      {isLoading ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-destructive shadow-rest">
          {(error as Error).message}
        </div>
      ) : data && data.origin === "base" ? (
        // Base TACO foods are read-only; only the clinic's own foods are editable.
        <div className="mt-6 rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-rest">
          Este é um alimento da tabela base e não pode ser editado. Você pode
          criar um alimento próprio da clínica.
        </div>
      ) : data ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Altere os dados do alimento próprio da clínica.
          </p>
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-rest">
            <FoodForm mode="edit" food={data} />
          </div>
        </>
      ) : null}
    </div>
  );
}
