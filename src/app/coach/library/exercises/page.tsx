"use client";

import { LibraryTabs } from "@/components/dashboard/library-tabs";
import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";

export default function CoachExercisesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <LibraryTabs subtitle="Consulte a biblioteca de exercícios de musculação, cardio e mais." />
      {/* No title here — the shared Biblioteca header above already carries it. */}
      <ExerciseCatalog apiBase="/api/exercises" basePath="/coach/library/exercises" />
    </div>
  );
}
