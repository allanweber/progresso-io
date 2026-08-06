"use client";

import { ExerciseDetail } from "@/components/exercises/exercise-detail";

export default function AdminExerciseDetailPage() {
  return <ExerciseDetail apiBase="/api/admin/exercises" backHref="/admin/exercises" />;
}
