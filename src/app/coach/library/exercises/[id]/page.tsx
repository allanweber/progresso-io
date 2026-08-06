"use client";

import { ExerciseDetail } from "@/components/exercises/exercise-detail";

export default function CoachExerciseDetailPage() {
  return (
    <ExerciseDetail apiBase="/api/exercises" backHref="/coach/library/exercises" />
  );
}
