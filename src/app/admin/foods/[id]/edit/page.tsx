"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { FoodForm } from "@/components/foods/food-form";
import { apiFetch } from "@/lib/api-client";
import type { AdminFoodDetailDto } from "@/lib/admin";

export default function EditBaseFoodPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-food", id],
    queryFn: () => apiFetch<AdminFoodDetailDto>(`/api/admin/foods/${id}`),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/admin/foods/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao alimento
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Editar alimento base
      </h1>

      {isLoading ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando…
        </div>
      ) : isError ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center text-sm text-destructive shadow-rest">
          {(error as Error).message}
        </div>
      ) : data && data.origin === "clinic" ? (
        // Clinic-owned foods are view-only for the admin — only base is editable.
        <div className="mt-6 rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-rest">
          Este alimento pertence à clínica{" "}
          <span className="font-medium text-foreground">{data.clinicName}</span>{" "}
          e não pode ser editado pela administração.
        </div>
      ) : data ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Altere os dados do alimento base (compartilhado com todas as clínicas).
          </p>
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-rest">
            <FoodForm
              mode="edit"
              food={data}
              apiBase="/api/admin/foods"
              listKey="admin-foods"
              detailKey="admin-food"
              detailPath="/admin/foods"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
