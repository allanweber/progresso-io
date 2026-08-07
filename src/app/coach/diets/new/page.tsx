"use client";

import { DietBuilder } from "@/components/diets/diet-builder";

export default function NewDietPage() {
  return (
    <div>
      <h1 className="mx-auto mb-4 max-w-3xl font-heading text-2xl font-bold text-foreground">
        Nova dieta
      </h1>
      <DietBuilder mode="create" />
    </div>
  );
}
