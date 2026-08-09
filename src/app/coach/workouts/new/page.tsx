"use client";

import { WorkoutBuilder } from "@/components/workouts/workout-builder";

export default function NewWorkoutPage() {
  return (
    <div>
      <h1 className="mx-auto mb-4 max-w-3xl font-heading text-2xl font-bold text-foreground">
        Novo treino
      </h1>
      <WorkoutBuilder mode="create" />
    </div>
  );
}
