"use client";

import { LibraryTabs } from "@/components/dashboard/library-tabs";
import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";

export default function CoachExercisesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <LibraryTabs subtitle="Consulte a biblioteca de exercícios com animações, filtros por região e equipamento." />
      <ExerciseCatalog
        apiBase="/api/exercises"
        basePath="/coach/library/exercises"
        createHref="/coach/library/exercises/new"
      />
    </div>
  );
}
