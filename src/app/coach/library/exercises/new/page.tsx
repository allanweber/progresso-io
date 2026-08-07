"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ExerciseForm } from "@/components/exercises/exercise-form";

export default function NewExercisePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/coach/library/exercises"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Exercícios
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Novo exercício
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre um exercício próprio da sua clínica. Ele aparece na biblioteca
        com o selo “próprio”, junto do catálogo base.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <ExerciseForm
          mode="create"
          apiBase="/api/exercises"
          imageEndpoint="/api/exercises/images"
          listKey="/api/exercises"
          detailKey="/api/exercises"
          detailPath="/coach/library/exercises"
        />
      </div>
    </div>
  );
}
