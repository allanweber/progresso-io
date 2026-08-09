"use client";

import { useState } from "react";
import { Dumbbell, Repeat } from "lucide-react";

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
  type WorkoutSessionDto,
} from "@/lib/workouts";
import { techniqueInfo } from "@/lib/workout-techniques";

/** Grouping context for an exercise inside a super-set / giant-set block. */
type GroupInfo = { position: number; total: number; nextName: string | null };

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
    list.forEach((ex, i) => {
      map.set(ex.id, {
        position: i + 1,
        total: list.length,
        nextName: i < list.length - 1 ? list[i + 1].name : null,
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
  const tech = techniqueInfo(exercise.technique);
  const inBlock = Boolean(group);
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
        className="absolute flex size-4 items-center justify-center rounded-full bg-white text-[9px] leading-none"
        style={{
          left: "1px",
          top: `calc(${NODE_TOP} - 0.5rem)`,
          border: `2px solid ${color}`,
        }}
      >
        {tech?.icon}
      </span>
    </div>
  ) : null;

  const body = (
    <div className="flex gap-2.5">
      {rail}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{exercise.name}</span>
            {/* Label the block on its first row; the node marks the rest. */}
            {tech && (first || !inBlock) && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ color: tech.color, backgroundColor: tech.bg }}
              >
                {tech.icon} {tech.label}
                {group ? ` · ${group.total} em sequência` : ""}
              </span>
            )}
          </span>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#64748B]">
            {exercise.sets}× {formatReps(exercise.reps)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {exercise.category ? `${CATEGORY_LABELS[exercise.category]} · ` : ""}
          descanso {formatRest(exercise.rest)}
          {exercise.load ? ` · ${exercise.load}` : ""}
        </div>
        {group && group.nextName && (
          <div className="mt-1 text-[11px] font-medium text-muted-foreground">
            ↳ sem descanso → {group.nextName}
          </div>
        )}
        {/* Only a count indicator in the full view — the list is in the detail. */}
        {subCount > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700">
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
 * When `onExerciseClick` is set, rows open the exercise detail.
 */
export function WorkoutSessionsView({
  sessions,
  onExerciseClick,
}: {
  sessions: WorkoutSessionDto[];
  onExerciseClick?: (exercise: WorkoutExerciseDto, group: GroupInfo | null) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        Este treino ainda não tem fichas.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const groups = groupInfoFor(session.exercises);
        return (
          <div
            key={session.id}
            className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
          >
            <div className="flex items-center gap-2 border-b border-border bg-surface-light px-4 py-3">
              <span className="font-heading font-semibold text-foreground">
                {session.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {session.exercises.length} exercício(s)
              </span>
            </div>
            {session.exercises.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">
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
 * The exercise's image carousel. Images that fail to load (e.g. the image CDN /
 * R2 isn't configured in a given environment) are dropped; when none remain a
 * dumbbell placeholder is shown instead of an empty gap. Keyed by exercise id by
 * the caller, so the failed-set resets when the exercise changes.
 */
function ExerciseImages({ images }: { images: string[] }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const onErr = (src: string) => setBroken((prev) => new Set(prev).add(src));
  const shown = images.filter((src) => !broken.has(src));

  if (shown.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-surface-light text-muted-foreground">
        <Dumbbell className="size-10" />
      </div>
    );
  }
  const [main, ...rest] = shown;
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={main}
        alt=""
        onError={() => onErr(main)}
        className="aspect-video w-full rounded-2xl bg-slate-900 object-cover"
      />
      {rest.length > 0 && (
        <div className="flex gap-2">
          {rest.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              onError={() => onErr(src)}
              className="h-16 flex-1 rounded-xl bg-slate-900 object-cover"
            />
          ))}
        </div>
      )}
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
}: {
  exercise: WorkoutExerciseDto | null;
  group?: GroupInfo | null;
  onClose: () => void;
}) {
  const tech = techniqueInfo(exercise?.technique);
  const images = (exercise?.images ?? [])
    .map((k) => exerciseImageUrl(k))
    .filter((u): u is string => Boolean(u));

  return (
    <Dialog open={Boolean(exercise)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        {exercise && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {exercise.name}
                {tech && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ color: tech.color, backgroundColor: tech.bg }}
                  >
                    {tech.icon} {tech.label}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-1">
              {/* Media — the exercise's images (main + thumbnails) */}
              <ExerciseImages key={exercise.id} images={images} />

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
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="mt-1 font-heading text-lg font-bold text-foreground">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Technique explanation */}
              {tech && (
                <div className="rounded-2xl p-4" style={{ backgroundColor: tech.bg }}>
                  <div
                    className="mb-1.5 flex items-center gap-2 text-[15px] font-bold"
                    style={{ color: tech.color }}
                  >
                    <span>{tech.icon}</span> Técnica: {tech.label}
                  </div>
                  <p className="text-[13px] leading-relaxed text-[#334155]">
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
                  <div className="text-[15px] font-bold text-foreground">
                    Bloco · exercício {group.position} de {group.total}
                  </div>
                  {group.nextName ? (
                    <div className="mt-1.5 text-[13px] text-[#334155]">
                      Sem descanso → <b>{group.nextName}</b>
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[13px] text-[#334155]">
                      Último do bloco — descanse ao final antes de repetir.
                    </div>
                  )}
                </div>
              )}

              {/* Execution cues */}
              {exercise.instructions.length > 0 && (
                <div>
                  <h3 className="mb-3 font-heading text-[15px] font-semibold">
                    Como executar
                  </h3>
                  <ol className="space-y-2.5">
                    {exercise.instructions.map((step, i) => (
                      <li
                        key={i}
                        className="flex gap-3 rounded-xl bg-surface-light p-3.5"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <span className="text-[13px] leading-relaxed text-[#334155]">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Substitutions */}
              {exercise.substitutes.length > 0 && (
                <div>
                  <h3 className="mb-3 font-heading text-[15px] font-semibold">
                    Substituições
                  </h3>
                  <ul className="overflow-hidden rounded-xl border border-border">
                    {exercise.substitutes.map((s) => (
                      <li
                        key={`${s.source}-${s.exerciseId}`}
                        className="flex items-center gap-2.5 border-b border-[#F4F6FA] px-4 py-3 text-[13px] last:border-b-0"
                      >
                        <span className="text-amber-700">⇄</span>
                        <span className="min-w-0 flex-1">
                          {s.name}
                          {s.note && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {s.note}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Muscles */}
              {exercise.primaryMuscles.length > 0 && (
                <div>
                  <h3 className="mb-2 font-heading text-[15px] font-semibold">
                    Músculos trabalhados
                  </h3>
                  <p className="text-[13px] text-[#334155]">
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
  );
}
