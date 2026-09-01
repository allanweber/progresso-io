"use client";

import { useState } from "react";
import { Check, ChevronLeft, Plus } from "lucide-react";

import { CATEGORY_LABELS } from "@/lib/exercises";
import { ExerciseImageButton } from "@/components/workouts/exercise-images";
import {
  ExerciseSearch,
  type PickedExercise,
} from "@/components/workouts/exercise-search";
import {
  ExercisePrescriptionFields,
  newPrescription,
  type PrescriptionDefaults,
  type PrescriptionDraft,
} from "@/components/workouts/exercise-prescription-fields";

export type { PickedExercise };

/**
 * Adds exercises to a ficha, in a loop. Step one searches the catalog (base +
 * this clinic's own) via `ExerciseSearch`; step two asks for the two fields a
 * prescription cannot do without — **séries e repetições** — with séries and
 * descanso already stamped from the ficha's padrão. Everything else (carga,
 * descanso, técnica, observação, substituições) waits behind `Mais detalhes`,
 * available right here but never demanded.
 *
 * Confirming returns to the search with the field ready for the next exercise,
 * so building an eight-exercise ficha is one continuous flow instead of eight
 * round trips. The caller closes the picker when the coach is done.
 */
export function ExercisePicker({
  excludeIds = [],
  defaults,
  onPick,
  onClose,
  autoFocus = true,
}: {
  /** Exercise ids to hide from the results (already in the ficha). */
  excludeIds?: string[];
  /** The ficha's séries/descanso padrão, stamped onto each new prescription. */
  defaults?: PrescriptionDefaults | null;
  onPick: (picked: {
    exercise: PickedExercise;
    prescription: PrescriptionDraft;
  }) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const [selected, setSelected] = useState<PickedExercise | null>(null);
  const [draft, setDraft] = useState<PrescriptionDraft>(() =>
    newPrescription(defaults),
  );
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function choose(exercise: PickedExercise) {
    setSelected(exercise);
    setDraft(newPrescription(defaults));
  }

  // Search step -----------------------------------------------------------
  if (!selected) {
    return (
      <div className="space-y-2">
        {justAdded && (
          <p
            role="status"
            className="flex items-center gap-1.5 px-1 text-label font-medium text-primary"
          >
            <Check className="size-3.5 shrink-0" aria-hidden />
            {justAdded} adicionado à ficha. Busque o próximo ou feche a busca.
          </p>
        )}
        <ExerciseSearch
          excludeIds={excludeIds}
          onPick={choose}
          onClose={onClose}
          autoFocus={autoFocus}
        />
      </div>
    );
  }

  // Prescription step -----------------------------------------------------
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-rest">
      <button
        type="button"
        onClick={() => setSelected(null)}
        className="mb-3 inline-flex items-center gap-1 text-body-dense font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
        Voltar aos resultados
      </button>
      <div className="mb-4 flex items-center gap-3">
        <ExerciseImageButton
          exerciseId={selected.id}
          name={selected.name}
          thumbnail={selected.thumbnail}
          className="size-11 rounded-lg"
        />
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
        defaults={defaults}
      />

      <button
        type="button"
        onClick={() => {
          onPick({ exercise: selected, prescription: draft });
          setJustAdded(selected.name);
          setSelected(null);
          setDraft(newPrescription(defaults));
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-body font-semibold text-white transition-colors hover:bg-primary/90"
      >
        <Plus className="size-4" />
        Adicionar ao treino
      </button>
    </div>
  );
}
