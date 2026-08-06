"use client";

import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";

export default function AdminExercisesPage() {
  return (
    <ExerciseCatalog
      apiBase="/api/admin/exercises"
      basePath="/admin/exercises"
      title="Exercícios"
      subtitle="Catálogo de exercícios da plataforma (base compartilhada e de cada clínica)."
    />
  );
}
