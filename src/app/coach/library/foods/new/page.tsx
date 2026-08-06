"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FoodForm } from "@/components/foods/food-form";

export default function NewFoodPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/coach/library"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Bibliotecas
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Novo alimento
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre um alimento próprio da sua clínica. Ele aparece na biblioteca
        com o selo “própria”, junto da tabela base.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <FoodForm mode="create" />
      </div>
    </div>
  );
}
