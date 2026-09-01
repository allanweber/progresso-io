"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Repeat, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/workouts/number-field";
import { RepsInput } from "@/components/workouts/reps-input";
import {
  ExerciseSearch,
  type PickedExercise,
} from "@/components/workouts/exercise-search";
import { apiFetch } from "@/lib/api-client";
import type { ExerciseDetailDto } from "@/lib/exercises";
import {
  formatRest,
  normalizeReps,
  resolveSets,
  type WorkoutReps,
} from "@/lib/workouts";
import {
  WORKOUT_TECHNIQUE_OPTIONS,
  isGroupingTechnique,
  techniqueInfo,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";

const newKey = () => crypto.randomUUID();

const numberInputBase =
  "h-11 min-w-0 flex-1 rounded-[10px] border-[1.5px] border-input bg-white py-2.5 text-center text-body tabular-nums text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15";
const numberInputClass = `${numberInputBase} px-3.5`;

/* Séries lives in a deliberately narrow column so the reps sequence gets the
   rest of the row — its stepper and padding shrink to match. */
const compactNumberInputClass = `${numberInputBase} px-2`;
const compactStepperClass =
  "flex size-9 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-input bg-white text-muted-foreground transition-colors hover:border-primary hover:text-primary";

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

/**
 * The ficha's séries/descanso **padrão**. It is a stamping tool, not an
 * inheritance layer: a new exercise is created from it and then owns its own
 * values, so nothing about it reaches the payload, the schema or the aluno.
 * Here it serves one more purpose — telling the coach when an exercise's
 * descanso diverges from the ficha, which is the only reason that field needs
 * to be named while it is collapsed.
 */
export type PrescriptionDefaults = { sets: number; rest: number };

/** A fresh prescription for a newly-picked exercise, stamped from the ficha padrão. */
export function newPrescription(
  defaults?: PrescriptionDefaults | null,
): PrescriptionDraft {
  return {
    sets: defaults?.sets ?? 3,
    reps: { kind: "range", values: [8, 12] },
    load: "",
    rest: defaults?.rest ?? 90,
    technique: null,
    note: "",
    customSubstitutes: [],
  };
}

/**
 * Whether this prescription carries anything beyond séries × repetições. Drives
 * both the disclosure's summary line and whether it opens already expanded — an
 * exercise that has detail never hides it behind a closed drawer.
 */
export function hasPrescriptionDetails(
  value: PrescriptionDraft,
  defaults?: PrescriptionDefaults | null,
): boolean {
  return describeDetails(value, defaults).length > 0;
}

/** The set details, in the coach's own words — `40 kg · descanso 60s · Drop set`. */
function describeDetails(
  value: PrescriptionDraft,
  defaults?: PrescriptionDefaults | null,
): string[] {
  const out: string[] = [];
  if (value.load.trim()) out.push(value.load.trim());
  // Descanso always holds a value, so it is only worth naming when it departs
  // from what the ficha declared.
  if (defaults && value.rest !== defaults.rest) {
    out.push(`descanso ${formatRest(value.rest)}`);
  }
  const tech = techniqueInfo(value.technique);
  if (tech) out.push(tech.label);
  if (value.note.trim()) out.push("observação");
  const subs = value.customSubstitutes.length;
  if (subs > 0) {
    out.push(subs === 1 ? "1 substituição" : `${subs} substituições`);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Tier 1 — the essentials, always visible                                    */
/* -------------------------------------------------------------------------- */

/**
 * Séries × Repetições — the two fields a prescription cannot do without, and
 * the only ones the coach is asked for by default. Two-up from `sm`; on a phone
 * they stack, because the picker sits four padded containers deep and the
 * Séries stepper alone needs more than half of what a column has left.
 */
function EssentialFields({
  value,
  onPatch,
}: {
  value: PrescriptionDraft;
  onPatch: (patch: Partial<PrescriptionDraft>) => void;
}) {
  // Several prescriptions can be open at once, so the hint id must be unique.
  const hintId = useId();

  // A pirâmide prescribes one set per position, so Séries follows the sequence
  // (and stops being typeable) — add/remove a position and the count moves.
  const reps = normalizeReps(value.reps);
  const pyramid = reps.kind === "pyramid";
  const sets = resolveSets(value.reps, value.sets);

  // Séries never needs more than a two-digit box, while a pirâmide can run to
  // six positions plus its two controls. Splitting the row down the middle
  // starved the side that needed the room, so Séries takes a fixed narrow
  // column and Repetições takes everything left — they stay on one line.
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr]">
      <div className="space-y-1.5">
        <div className="flex h-8 items-center">
          <Label>Séries</Label>
        </div>
        {pyramid ? (
          <>
            <input
              readOnly
              value={sets}
              aria-label="Séries"
              aria-describedby={hintId}
              className="h-11 w-full rounded-[10px] border-[1.5px] border-dashed border-input bg-surface-light px-2 py-2.5 text-center text-body tabular-nums text-muted-foreground"
            />
            <p id={hintId} className="text-label text-muted-foreground">
              Definido pela pirâmide — uma série por posição.
            </p>
          </>
        ) : (
          <NumberField
            value={sets}
            onCommit={(next) => onPatch({ sets: next })}
            min={1}
            max={50}
            maxDigits={2}
            stepper
            ariaLabel="Séries"
            inputClassName={compactNumberInputClass}
            stepperButtonClassName={compactStepperClass}
          />
        )}
      </div>
      <RepsInput
        value={value.reps}
        onChange={(reps) => onPatch({ reps, sets: resolveSets(reps, value.sets) })}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tier 2 — the details, behind one disclosure                                */
/* -------------------------------------------------------------------------- */

/**
 * Carga, descanso, técnica avançada, observação and substituições. Everything
 * here is optional for most exercises, so it only renders once the coach opens
 * the drawer — which also means the substitutes lookup below stops firing once
 * per exercise on a screen the coach never asked for.
 */
function DetailFields({
  exerciseId,
  excludeIds,
  value,
  onPatch,
}: {
  exerciseId: string;
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
          <Label>Carga (opcional)</Label>
          <Input
            value={value.load}
            onChange={(e) => onPatch({ load: e.target.value })}
            placeholder="Ex.: 40 kg, peso corporal"
          />
        </div>
        <div>
          <Label>Descanso (s)</Label>
          <div className="mt-1">
            <NumberField
              value={value.rest}
              onCommit={(rest) => onPatch({ rest })}
              min={0}
              max={3600}
              step={15}
              maxDigits={4}
              stepper
              ariaLabel="Descanso"
              inputClassName={numberInputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Técnica avançada</Label>
        <select
          value={value.technique ?? ""}
          onChange={(e) =>
            onPatch({
              technique: e.target.value
                ? (e.target.value as WorkoutTechnique)
                : null,
            })
          }
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-body text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
        >
          <option value="">Nenhuma técnica</option>
          {WORKOUT_TECHNIQUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isGroupingTechnique(value.technique) && (
          <p className="mt-1 text-label text-muted-foreground">
            Encadeia com o próximo exercício da ficha, sem descanso entre eles.
            Para um giant set, marque também os exercícios seguintes.
          </p>
        )}
      </div>

      <div>
        <Label>Observação (opcional)</Label>
        <Textarea
          rows={2}
          value={value.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder="Nota para este exercício…"
          maxLength={280}
        />
      </div>

      <div>
        <Label>
          Substituições · {total}
          {librarySubs.length > 0 ? ` (${librarySubs.length} da biblioteca)` : ""}
        </Label>
        {value.customSubstitutes.length > 0 && (
          <ul className="mt-1 space-y-1.5">
            {value.customSubstitutes.map((cs) => (
              <li key={cs.key} className="flex items-center gap-2">
                <Repeat className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-body">{cs.name}</span>
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
                  className="h-8 w-40 text-label"
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
              className="inline-flex items-center gap-1 text-label font-medium text-muted-foreground hover:text-primary"
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

/* -------------------------------------------------------------------------- */
/*  The two tiers, composed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One exercise's prescription, in two tiers. **Séries × Repetições** are always
 * on screen; **carga, descanso, técnica avançada, observação e substituições**
 * live behind a single `Mais detalhes` disclosure that stays closed until the
 * coach wants them. Nothing is ever hidden silently: closed, the disclosure's
 * second line either names what is set (`40 kg · Drop set · observação`) or, on
 * an untouched exercise, advertises what is available inside. Rendered
 * identically at **insertion** (inside the ExercisePicker) and at **edit**
 * (inside a builder row).
 */
export function ExercisePrescriptionFields({
  exerciseId,
  excludeIds,
  value,
  onPatch,
  defaults,
  defaultDetailsOpen = false,
}: {
  exerciseId: string;
  /** Exercise ids to hide from the substitute search (self + ficha + added). */
  excludeIds: string[];
  value: PrescriptionDraft;
  onPatch: (patch: Partial<PrescriptionDraft>) => void;
  /** The ficha's padrão, so a diverging descanso can be named while collapsed. */
  defaults?: PrescriptionDefaults | null;
  defaultDetailsOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultDetailsOpen);
  const panelId = useId();
  const set = describeDetails(value, defaults);

  return (
    <div className="space-y-3">
      <EssentialFields value={value} onPatch={onPatch} />

      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex w-full items-start gap-2 rounded-[10px] border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:border-primary"
        >
          {open ? (
            <ChevronDown
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-body-dense font-semibold text-[#334155]">
              Mais detalhes
            </span>
            {!open && (
              <span className="line-clamp-2 block text-label text-muted-foreground">
                {set.length > 0
                  ? set.join(" · ")
                  : "carga · descanso · técnica · observação · substituições"}
              </span>
            )}
          </span>
        </button>

        {open && (
          <div id={panelId} className="mt-3">
            <DetailFields
              exerciseId={exerciseId}
              excludeIds={excludeIds}
              value={value}
              onPatch={onPatch}
            />
          </div>
        )}
      </div>
    </div>
  );
}
