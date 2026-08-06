"use client";

import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";

export default function CoachExercisesPage() {
  return (
    <ExerciseCatalog
      apiBase="/api/exercises"
      basePath="/coach/library/exercises"
      title="Exercícios"
      subtitle="Consulte a biblioteca de exercícios de musculação, cardio e mais."
    />
  );
}
