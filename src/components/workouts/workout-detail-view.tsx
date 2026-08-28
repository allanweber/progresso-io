"use client";

import { useState } from "react";
import {
  ChevronRight,
  CornerDownRight,
  HeartPulse,
  Repeat,
  TrendingUp,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CATEGORY_LABELS,
  MUSCLE_LABELS,
  exerciseImageUrl,
} from "@/lib/exercises";
import {
  formatRest,
  formatReps,
  type WorkoutExerciseDto,
  type WorkoutExerciseSubstituteDto,
  type WorkoutSessionDto,
} from "@/lib/workouts";
import {
  isGroupingTechnique,
  techniqueInfo,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";
import { ExerciseImages } from "@/components/workouts/exercise-images";
import {
  TechniqueBadge,
  TechniqueIcon,
} from "@/components/workouts/technique-icon";
import { cn } from "@/lib/utils";

/**
 * Grouping context for an exercise inside a super-set / giant-set block. A block
 * is a run of exercises sharing a `groupId`; only its **opening** member(s) carry
 * the grouping technique (which "chains" into the following exercise), so the
 * block's technique is resolved once here and shown on every member's rail.
 */
export type GroupInfo = {
  position: number;
  total: number;
  nextName: string | null;
  technique: WorkoutTechnique | null;
};

/** Computes the super-set/giant grouping of a session's exercises by `groupId`. */
function groupInfoFor(
  exercises: WorkoutExerciseDto[],
): Map<string, GroupInfo> {
  const map = new Map<string, GroupInfo>();
  const runs = new Map<string, WorkoutExerciseDto[]>();
  for (const ex of exercises) {
    if (!ex.groupId) continue;
    const list = runs.get(ex.groupId) ?? [];
    list.push(ex);
    runs.set(ex.groupId, list);
  }
  for (const list of runs.values()) {
    // The block's technique is the first member carrying a grouping technique.
    const technique =
      list.find((ex) => isGroupingTechnique(ex.technique))?.technique ?? null;
    list.forEach((ex, i) => {
      map.set(ex.id, {
        position: i + 1,
        total: list.length,
        nextName: i < list.length - 1 ? list[i + 1].name : null,
        technique,
      });
    });
  }
  return map;
}

function ExerciseRow({
  exercise,
  group,
  onClick,
}: {
  exercise: WorkoutExerciseDto;
  group: GroupInfo | null;
  onClick?: () => void;
}) {
  const inBlock = Boolean(group);
  // A block member shows the block's technique (its opener's) on the rail/badge;
  // a standalone exercise shows its own technique.
  const techKey = inBlock
    ? group!.technique ?? exercise.technique
    : exercise.technique;
  const tech = techniqueInfo(techKey);
  const color = tech?.color ?? "#059669";
  const first = group?.position === 1;
  const last = group ? group.position === group.total : false;
  const subCount = exercise.substitutes.length;

  // A continuous rail spans the whole super-set / giant block: each grouped row
  // draws a vertical line that overlaps its neighbours (negative top/bottom) so
  // the segments join, plus a technique-icon node on the line beside the row.
  const NODE_TOP = "1.05rem"; // node center, aligned with the exercise name line
  const rail = inBlock ? (
    <div className="relative w-5 shrink-0" aria-hidden>
      <span
        className="absolute w-[3px] rounded-full"
        style={{
          left: "7px",
          backgroundColor: color,
          top: first ? NODE_TOP : "-0.9rem",
          ...(last
            ? { height: `calc(${NODE_TOP} + 0.9rem)` }
            : { bottom: "-0.9rem" }),
        }}
      />
      <span
        className="absolute flex size-4 items-center justify-center rounded-full bg-white"
        style={{
          left: "1px",
          top: `calc(${NODE_TOP} - 0.5rem)`,
          border: `2px solid ${color}`,
          color,
        }}
      >
        <TechniqueIcon technique={techKey} className="size-2.5" />
      </span>
    </div>
  ) : null;

  const body = (
    <div className="flex gap-2.5">
      {rail}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-body font-semibold text-foreground">
              {exercise.name}
            </span>
            {/* Label the block on its first row; the node marks the rest. */}
            {tech && (first || !inBlock) && (
              <TechniqueBadge
                technique={techKey}
                suffix={group ? ` · ${group.total} em sequência` : undefined}
              />
            )}
          </span>
          <span className="shrink-0 whitespace-nowrap text-body font-semibold tabular-nums text-muted-foreground">
            {exercise.sets}× {formatReps(exercise.reps)}
          </span>
        </div>
        <div className="mt-0.5 text-label text-muted-foreground">
          {exercise.category ? `${CATEGORY_LABELS[exercise.category]} · ` : ""}
          descanso {formatRest(exercise.rest)}
          {exercise.load ? ` · ${exercise.load}` : ""}
        </div>
        {group && group.nextName && (
          <div className="mt-1 flex items-center gap-1 text-label font-medium text-muted-foreground">
            <CornerDownRight className="size-3 shrink-0" aria-hidden />
            sem descanso → {group.nextName}
          </div>
        )}
        {exercise.note && (
          <div className="mt-1 line-clamp-2 text-body-dense italic text-muted-foreground">
            “{exercise.note}”
          </div>
        )}
        {/* Only a count indicator in the full view — the list is in the detail. */}
        {subCount > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-label font-medium text-amber-700">
            <Repeat className="size-3 shrink-0" />
            {subCount} {subCount === 1 ? "substituição" : "substituições"}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <li className="border-b border-[#F4F6FA] px-4 py-3 last:border-b-0">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="block w-full text-left transition-colors hover:opacity-80"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

/**
 * The read-only sessions (fichas) of a workout: each ficha is a card, each
 * exercise a row with its prescription (séries × reps, descanso, carga), the
 * advanced-technique badge, super-set/giant grouping rail, and its substitutes.
 * When `onExerciseClick` is set, rows open the exercise detail. The program's
 * `cardio` prescription (free text), when set, is shown above the fichas.
 */
export function WorkoutSessionsView({
  sessions,
  cardio,
  onExerciseClick,
  posture,
}: {
  sessions: WorkoutSessionDto[];
  /** The program-level cardio prescription (free text); hidden when empty. */
  cardio?: string | null;
  onExerciseClick?: (exercise: WorkoutExerciseDto, group: GroupInfo | null) => void;
  /**
   * `"reading"` steps the reading rungs of the type ramp up one notch for the
   * aluno portal (see `.posture-reading` in globals.css). The coach's dense
   * default is deliberate — omit it there.
   */
  posture?: "reading";
}) {
  const cardioCard = cardio ? (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary-light text-primary">
        <HeartPulse className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="font-heading text-subtitle font-semibold text-foreground">
          Cardio
        </div>
        <p className="mt-0.5 whitespace-pre-line text-body text-muted-foreground">
          {cardio}
        </p>
      </div>
    </div>
  ) : null;

  if (sessions.length === 0) {
    return (
      <div className={cn("space-y-4", posture === "reading" && "posture-reading")}>
        {cardioCard}
        <div className="rounded-2xl border border-border bg-white p-8 text-center text-body text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Este treino ainda não tem fichas.
        </div>
      </div>
    );
  }
  return (
    <div className={cn("space-y-4", posture === "reading" && "posture-reading")}>
      {cardioCard}
      {sessions.map((session) => {
        const groups = groupInfoFor(session.exercises);
        return (
          <div
            key={session.id}
            className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-center gap-2 border-b border-border bg-surface-light px-4 py-3">
              <span className="font-heading text-subtitle font-semibold text-foreground">
                {session.name}
              </span>
              <span className="text-label text-muted-foreground">
                {session.exercises.length} exercício(s)
              </span>
            </div>
            {session.exercises.length === 0 ? (
              <div className="px-4 py-4 text-body text-muted-foreground">
                Sem exercícios.
              </div>
            ) : (
              <ul>
                {session.exercises.map((exercise) => {
                  const group = groups.get(exercise.id) ?? null;
                  return (
                    <ExerciseRow
                      key={exercise.id}
                      exercise={exercise}
                      group={group}
                      onClick={
                        onExerciseClick
                          ? () => onExerciseClick(exercise, group)
                          : undefined
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The exercise-detail dialog: image carousel, the advanced-technique
 * explanation, super-set block info, prescription, execution steps (cues),
 * substitutions and worked muscles — all hydrated live from the catalog.
 */
export function WorkoutExerciseDetail({
  exercise,
  group,
  onClose,
  posture,
}: {
  exercise: WorkoutExerciseDto | null;
  group?: GroupInfo | null;
  onClose: () => void;
  /** See `WorkoutSessionsView`. Carried onto the dialog, which portals out. */
  posture?: "reading";
}) {
  // Block members show the block's technique (the opener's) even when their own
  // `technique` is null (they are the chained tail of the super-set / giant set).
  const techKey = exercise?.technique ?? group?.technique ?? null;
  const tech = techniqueInfo(techKey);
  const images = (exercise?.images ?? [])
    .map((k) => exerciseImageUrl(k))
    .filter((u): u is string => Boolean(u));

  // A substitute the athlete tapped, shown in its own detail dialog on top.
  const [sub, setSub] = useState<WorkoutExerciseSubstituteDto | null>(null);

  return (
    <>
    <Dialog open={Boolean(exercise)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto sm:max-w-lg",
          posture === "reading" && "posture-reading",
        )}
      >
        {exercise && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {exercise.name}
                {tech && <TechniqueBadge technique={techKey} />}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-1">
              {/* Media — the exercise's images (main + thumbnails) */}
              <ExerciseImages
                key={exercise.id}
                images={images}
                name={exercise.name}
              />

              {/* Prescription stat cards */}
              <div className="grid grid-cols-4 gap-2.5">
                {[
                  { label: "Séries", value: String(exercise.sets) },
                  { label: "Reps", value: formatReps(exercise.reps) },
                  { label: "Carga", value: exercise.load ?? "—" },
                  { label: "Descanso", value: formatRest(exercise.rest) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl bg-surface-light px-2 py-3 text-center"
                  >
                    <div className="text-eyebrow font-semibold uppercase text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="mt-1 font-heading text-title font-bold tabular-nums text-foreground">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pyramid hint — the load rises as reps fall each set */}
              {exercise.reps.kind === "pyramid" && (
                <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-body font-medium text-primary">
                  <TrendingUp className="size-4 shrink-0" aria-hidden />
                  Pirâmide — aumente a carga a cada série, reduzindo as
                  repetições.
                </div>
              )}

              {/* Coach's note for this exercise */}
              {exercise.note && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-1 text-eyebrow font-semibold uppercase text-amber-700">
                    Observação do treinador
                  </div>
                  <p className="text-body text-[#334155]">
                    {exercise.note}
                  </p>
                </div>
              )}

              {/* Technique explanation */}
              {tech && (
                <div className="rounded-2xl p-4" style={{ backgroundColor: tech.bg }}>
                  <div
                    className="mb-1.5 flex items-center gap-2 text-subtitle font-semibold"
                    style={{ color: tech.color }}
                  >
                    <TechniqueIcon technique={techKey} className="size-4 shrink-0" />
                    Técnica: {tech.label}
                  </div>
                  <p className="text-body text-[#334155]">
                    {tech.description}
                  </p>
                </div>
              )}

              {/* Super-set block info */}
              {group && (
                <div
                  className="rounded-2xl border p-4"
                  style={{ borderColor: tech?.color ?? "#059669" }}
                >
                  <div className="text-subtitle font-semibold text-foreground">
                    Bloco · exercício {group.position} de {group.total}
                  </div>
                  {group.nextName ? (
                    <div className="mt-1.5 text-body text-[#334155]">
                      Sem descanso → <b>{group.nextName}</b>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-body text-[#334155]">
                      Último do bloco — descanse ao final antes de repetir.
                    </div>
                  )}
                </div>
              )}

              {/* Execution cues */}
              {exercise.instructions.length > 0 && (
                <div>
                  <h3 className="mb-3 font-heading text-subtitle font-semibold">
                    Como executar
                  </h3>
                  <ol className="space-y-2.5">
                    {exercise.instructions.map((step, i) => (
                      <li
                        key={i}
                        className="flex gap-3 rounded-xl bg-surface-light p-3.5"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold tabular-nums text-primary">
                          {i + 1}
                        </span>
                        <span className="text-body text-[#334155]">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Substitutions — tap one to see its own detail */}
              {exercise.substitutes.length > 0 && (
                <div>
                  <h3 className="mb-3 font-heading text-subtitle font-semibold">
                    Substituições
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-border">
                    {exercise.substitutes.map((s) => {
                      const thumb = exerciseImageUrl(s.thumbnail);
                      return (
                        <li
                          key={`${s.source}-${s.exerciseId}`}
                          className="border-b border-[#F4F6FA] last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => setSub(s)}
                            className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-light"
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumb}
                                alt=""
                                className="size-9 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-light text-amber-700">
                                <Repeat className="size-4" aria-hidden />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-body font-medium text-foreground">
                                {s.name}
                              </span>
                              {s.note && (
                                <span className="block truncate text-body-dense text-muted-foreground">
                                  {s.note}
                                </span>
                              )}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Muscles */}
              {exercise.primaryMuscles.length > 0 && (
                <div>
                  <h3 className="mb-2 font-heading text-subtitle font-semibold">
                    Músculos trabalhados
                  </h3>
                  <p className="text-body text-[#334155]">
                    {exercise.primaryMuscles
                      .map((m) => MUSCLE_LABELS[m])
                      .join(", ")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

    <SubstituteDetail sub={sub} onClose={() => setSub(null)} posture={posture} />
    </>
  );
}

/**
 * A substitute exercise's own detail, shown in a dialog stacked on top of the
 * exercise detail: title, image carousel, execution steps and worked muscles —
 * so the athlete can decide whether the swap works for them. Rendered from the
 * data already hydrated onto the substitute (no extra request), so it works the
 * same in the coach and aluno views.
 */
function SubstituteDetail({
  sub,
  onClose,
  posture,
}: {
  sub: WorkoutExerciseSubstituteDto | null;
  onClose: () => void;
  posture?: "reading";
}) {
  const images = (sub?.images ?? [])
    .map((k) => exerciseImageUrl(k))
    .filter((u): u is string => Boolean(u));

  return (
    <Dialog open={Boolean(sub)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto sm:max-w-lg",
          posture === "reading" && "posture-reading",
        )}
      >
        {sub && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Repeat className="size-4 shrink-0 text-amber-700" aria-hidden />
                {sub.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-1">
              <ExerciseImages
                key={sub.exerciseId}
                images={images}
                name={sub.name}
              />

              {sub.note && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-1 text-eyebrow font-semibold uppercase text-amber-700">
                    Por que substituir
                  </div>
                  <p className="text-body text-[#334155]">
                    {sub.note}
                  </p>
                </div>
              )}

              {sub.instructions.length > 0 ? (
                <div>
                  <h3 className="mb-3 font-heading text-subtitle font-semibold">
                    Como executar
                  </h3>
                  <ol className="space-y-2.5">
                    {sub.instructions.map((step, i) => (
                      <li
                        key={i}
                        className="flex gap-3 rounded-xl bg-surface-light p-3.5"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold tabular-nums text-primary">
                          {i + 1}
                        </span>
                        <span className="text-body text-[#334155]">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <p className="text-body text-muted-foreground">
                  Sem passos de execução cadastrados para este exercício.
                </p>
              )}

              {sub.primaryMuscles.length > 0 && (
                <div>
                  <h3 className="mb-2 font-heading text-subtitle font-semibold">
                    Músculos trabalhados
                  </h3>
                  <p className="text-body text-[#334155]">
                    {sub.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
