"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ExerciseForm } from "@/components/exercises/exercise-form";

export default function NewBaseExercisePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/exercises"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Catálogo
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Novo exercício base
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cria um exercício no catálogo base, compartilhado com todas as clínicas.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <ExerciseForm
          mode="create"
          apiBase="/api/admin/exercises"
          imageEndpoint="/api/admin/exercises/images"
          listKey="/api/admin/exercises"
          detailKey="/api/admin/exercises"
          detailPath="/admin/exercises"
        />
      </div>
    </div>
  );
}
