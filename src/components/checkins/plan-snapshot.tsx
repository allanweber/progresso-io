"use client";

import { Apple, Dumbbell } from "lucide-react";

import type { CheckinPlanRefDto } from "@/lib/student-checkins";

/**
 * "O que ele estava seguindo" — the diet and workout that were in force on the
 * check-in's date, shown in the detail dialog on both sides (coach review and
 * aluno history).
 *
 * The refs are frozen onto the check-in when it is written, resolved against its
 * DATE — so an imported check-in from March shows March's plan, not today's. A
 * plan deleted since then still reads here (name + version were copied), which
 * is why this renders text rather than a link. Nothing published by that date
 * means no block at all: an empty "sem dieta" line would say less than silence.
 */
export function PlanSnapshotView({
  diet,
  workout,
}: {
  diet: CheckinPlanRefDto | null;
  workout: CheckinPlanRefDto | null;
}) {
  if (!diet && !workout) return null;

  return (
    <div className="rounded-xl border border-border px-3.5 py-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Plano seguido nesta data
      </div>
      <div className="flex flex-col gap-1.5 text-body-dense text-foreground">
        {diet ? (
          <div className="flex items-center gap-2">
            <Apple className="size-3.5 shrink-0 text-primary" />
            <span className="font-medium">{diet.name}</span>
            <span className="text-muted-foreground">v{diet.version}</span>
          </div>
        ) : null}
        {workout ? (
          <div className="flex items-center gap-2">
            <Dumbbell className="size-3.5 shrink-0 text-primary" />
            <span className="font-medium">{workout.name}</span>
            <span className="text-muted-foreground">v{workout.version}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
