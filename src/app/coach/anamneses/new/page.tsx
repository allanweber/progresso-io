"use client";

import { AnamnesisBuilder } from "@/components/anamneses/anamnesis-builder";

export default function NewAnamnesisPage() {
  return (
    <div>
      <h1 className="mx-auto mb-4 max-w-3xl font-heading text-2xl font-bold text-foreground">
        Nova anamnese
      </h1>
      <AnamnesisBuilder mode="create" />
    </div>
  );
}
