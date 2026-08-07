"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";
import { Button } from "@/components/ui/button";

export default function AdminExercisesPage() {
  return (
    <ExerciseCatalog
      apiBase="/api/admin/exercises"
      basePath="/admin/exercises"
      admin
      title="Exercícios"
      subtitle="Catálogo de exercícios da plataforma (base compartilhada e de cada clínica)."
      action={
        <Button asChild>
          <Link href="/admin/exercises/new">
            <Plus className="size-4" />
            Novo exercício base
          </Link>
        </Button>
      }
    />
  );
}
