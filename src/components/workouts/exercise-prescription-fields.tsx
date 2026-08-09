"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RepsInput } from "@/components/workouts/reps-input";
import {
  ExerciseSearch,
  type PickedExercise,
} from "@/components/workouts/exercise-search";
import { apiFetch } from "@/lib/api-client";
import type { ExerciseDetailDto } from "@/lib/exercises";
import type { WorkoutReps } from "@/lib/workouts";
import {
  WORKOUT_TECHNIQUE_OPTIONS,
  isGroupingTechnique,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";

const newKey = () => crypto.randomUUID();

/** A custom substitute the coach adds to a workout exercise (client draft). */
export type CustomSubDraft = {
  key: string;
  exerciseId: string;
  name: string;
  code: string | null;
  thumbnail: string | null;
  note: string;
};

/** The editable prescription of one exercise — shared by insert + edit. */
export type PrescriptionDraft = {
  sets: number;
  reps: WorkoutReps;
  load: string;
  rest: number;
  technique: WorkoutTechnique | null;
  note: string;
  customSubstitutes: CustomSubDraft[];
};

/** A fresh prescription for a newly-picked exercise. */
export function newPrescription(): PrescriptionDraft {
  return {
    sets: 3,
    reps: { kind: "range", values: [8, 12] },
    load: "",
    rest: 90,
    technique: null,
    note: "",
    customSubstitutes: [],
  };
}

/**
 * The full field set for one exercise's prescription — séries, repetições
 * (número / intervalo-sequência / falha), carga, descanso, técnica avançada, uma
 * observação livre, and its substituições (the count of library swaps + the
 * coach's own custom ones). Rendered identically at **insertion** (inside the
 * ExercisePicker) and at **edit** (inside a builder row); fields stack vertically
 * on mobile and go two-per-row from `sm`.
 */
export function ExercisePrescriptionFields({
  exerciseId,
  excludeIds,
  value,
  onPatch,
}: {
  exerciseId: string;
  /** Exercise ids to hide from the substitute search (self + ficha + added). */
  excludeIds: string[];
  value: PrescriptionDraft;
  onPatch: (patch: Partial<PrescriptionDraft>) => void;
}) {
  const [addingSub, setAddingSub] = useState(false);

  // The exercise's library substitutes (base + clinic), just to show the count.
  const { data } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: () => apiFetch<ExerciseDetailDto>(`/api/exercises/${exerciseId}`),
    staleTime: 5 * 60_000,
  });
  const librarySubs = data?.substitutes ?? [];
  const customIds = new Set(value.customSubstitutes.map((c) => c.exerciseId));
  const libraryCount = librarySubs.filter((s) => !customIds.has(s.exerciseId)).length;
  const total = libraryCount + value.customSubstitutes.length;

  function addCustom(ex: PickedExercise) {
    onPatch({
      customSubstitutes: [
        ...value.customSubstitutes,
        {
          key: newKey(),
          exerciseId: ex.id,
          name: ex.name,
          code: ex.code,
          thumbnail: ex.thumbnail,
          note: "",
        },
      ],
    });
    setAddingSub(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Séries
          </Label>
          <Input
            inputMode="numeric"
            value={value.sets}
            onChange={(e) =>
              onPatch({
                sets: Math.max(
                  1,
                  Math.min(50, parseInt(e.target.value.replace(/\D/g, ""), 10) || 1),
                ),
              })
            }
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Repetições
          </Label>
          <RepsInput value={value.reps} onChange={(reps) => onPatch({ reps })} />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Carga (opcional)
          </Label>
          <Input
            value={value.load}
            onChange={(e) => onPatch({ load: e.target.value })}
            placeholder="Ex.: 40 kg, peso corporal"
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Descanso (s)
          </Label>
          <Input
            inputMode="numeric"
            value={value.rest}
            onChange={(e) =>
              onPatch({
                rest: Math.max(
                  0,
                  Math.min(3600, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0),
                ),
              })
            }
          />
        </div>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Técnica avançada
        </Label>
        <select
          value={value.technique ?? ""}
          onChange={(e) =>
            onPatch({
              technique: e.target.value
                ? (e.target.value as WorkoutTechnique)
                : null,
            })
          }
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">Nenhuma técnica</option>
          {WORKOUT_TECHNIQUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isGroupingTechnique(value.technique) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Encadeia com o próximo exercício da ficha, sem descanso entre eles.
            Para um giant set, marque também os exercícios seguintes.
          </p>
        )}
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Observação (opcional)
        </Label>
        <Textarea
          rows={2}
          value={value.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder="Nota para este exercício…"
          maxLength={280}
        />
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Substituições · {total}
          {librarySubs.length > 0 ? ` (${librarySubs.length} da biblioteca)` : ""}
        </Label>
        {value.customSubstitutes.length > 0 && (
          <ul className="mt-1 space-y-1.5">
            {value.customSubstitutes.map((cs) => (
              <li key={cs.key} className="flex items-center gap-2">
                <span className="text-amber-600">⇄</span>
                <span className="min-w-0 flex-1 truncate text-sm">{cs.name}</span>
                <Input
                  value={cs.note}
                  onChange={(e) =>
                    onPatch({
                      customSubstitutes: value.customSubstitutes.map((c) =>
                        c.key === cs.key ? { ...c, note: e.target.value } : c,
                      ),
                    })
                  }
                  placeholder="Motivo (opcional)"
                  className="h-8 w-40 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      customSubstitutes: value.customSubstitutes.filter(
                        (c) => c.key !== cs.key,
                      ),
                    })
                  }
                  aria-label="Remover substituição"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          {addingSub ? (
            <ExerciseSearch
              placeholder="Buscar exercício substituto…"
              excludeIds={[
                exerciseId,
                ...excludeIds,
                ...value.customSubstitutes.map((c) => c.exerciseId),
              ]}
              onPick={addCustom}
              onClose={() => setAddingSub(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingSub(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary"
            >
              <Plus className="size-3.5" />
              Adicionar substituição
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
