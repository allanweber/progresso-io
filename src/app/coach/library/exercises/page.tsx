"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { LibraryTabs } from "@/components/dashboard/library-tabs";
import { ExerciseCatalog } from "@/components/exercises/exercise-catalog";
import { Button } from "@/components/ui/button";

export default function CoachExercisesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <LibraryTabs
        subtitle="Consulte a biblioteca de exercícios de musculação, cardio e mais."
        action={
          <Button asChild>
            <Link href="/coach/library/exercises/new">
              <Plus className="size-4" />
              Novo exercício
            </Link>
          </Button>
        }
      />
      {/* No title here — the shared Biblioteca header above already carries it. */}
      <ExerciseCatalog apiBase="/api/exercises" basePath="/coach/library/exercises" />
    </div>
  );
}
