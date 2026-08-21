"use client";

import { useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";

import { CATEGORY_LABELS, exerciseImageUrl } from "@/lib/exercises";
import {
  ExerciseSearch,
  type PickedExercise,
} from "@/components/workouts/exercise-search";
import {
  ExercisePrescriptionFields,
  newPrescription,
  type PrescriptionDraft,
} from "@/components/workouts/exercise-prescription-fields";

export type { PickedExercise };

/**
 * Adds an exercise to a ficha. Step one searches the catalog (base + this
 * clinic's own) via `ExerciseSearch`; step two prescribes it with the full
 * field set — séries, repetições (número / intervalo-sequência / falha), carga
 * opcional, descanso, técnica avançada, uma observação, e substituições (a
 * biblioteca + as próprias do coach) — via the shared `ExercisePrescriptionFields`.
 * Confirming emits the exercise together with its complete prescription, so
 * everything is set at insertion time, not only on edit.
 */
export function ExercisePicker({
  excludeIds = [],
  onPick,
  onClose,
  autoFocus = true,
}: {
  /** Exercise ids to hide from the results (already in the ficha). */
  excludeIds?: string[];
  onPick: (picked: {
    exercise: PickedExercise;
    prescription: PrescriptionDraft;
  }) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [selected, setSelected] = useState<PickedExercise | null>(null);
  const [draft, setDraft] = useState<PrescriptionDraft>(newPrescription);

  function choose(exercise: PickedExercise) {
    setSelected(exercise);
    setDraft(newPrescription());
  }

  // Search step -----------------------------------------------------------
  if (!selected) {
    return (
      <ExerciseSearch
        excludeIds={excludeIds}
        onPick={choose}
        onClose={onClose}
        autoFocus={autoFocus}
      />
    );
  }

  // Prescription step -----------------------------------------------------
  const thumb = exerciseImageUrl(selected.thumbnail);
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        onClick={() => setSelected(null)}
        className="mb-3 inline-flex items-center gap-1 text-body-dense font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
        Voltar aos resultados
      </button>
      <div className="mb-4 flex items-center gap-3">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="size-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="size-11 shrink-0 rounded-lg bg-surface-light" />
        )}
        <div className="min-w-0">
          <div className="truncate text-subtitle font-semibold text-foreground">
            {selected.name}
          </div>
          <div className="text-label text-muted-foreground">
            {CATEGORY_LABELS[selected.category]}
          </div>
        </div>
      </div>

      <ExercisePrescriptionFields
        exerciseId={selected.id}
        excludeIds={excludeIds}
        value={draft}
        onPatch={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />

      <button
        type="button"
        onClick={() => {
          onPick({ exercise: selected, prescription: draft });
          setSelected(null);
          setDraft(newPrescription());
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-body font-semibold text-white hover:bg-primary/90"
      >
        <Plus className="size-4" />
        Adicionar ao treino
      </button>
    </div>
  );
}
