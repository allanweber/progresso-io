"use client";

import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  ChevronsDown,
  Grid3x3,
  Link2,
  Pause,
  Timer,
  TrendingDown,
  Waypoints,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { techniqueInfo, type WorkoutTechnique } from "@/lib/workout-techniques";

/**
 * The drawn mark for each técnica avançada.
 *
 * Every one depicts the **mechanic the aluno has to perform**, never a mood:
 * the load falling once (drop set) or in steps (triple drop), links chaining
 * exercises with no rest between them (super set) and a run of chained nodes
 * (giant set), the 10×10 matrix of GVT, the fixed short rest that defines FS7,
 * the pause rest-pause is named for, and the mini-blocks of a cluster.
 *
 * This lives here rather than in the catalog because `lib/workout-techniques`
 * is imported by the schema and the DAL and must stay free of React.
 */
export const TECHNIQUE_ICONS: Record<WorkoutTechnique, LucideIcon> = {
  dropset: TrendingDown,
  tripledrop: ChevronsDown,
  superset: Link2,
  giant: Waypoints,
  gvt: Grid3x3,
  fs7: Timer,
  restpause: Pause,
  cluster: Blocks,
};

/** The technique's mark alone — for the super-set rail node. */
export function TechniqueIcon({
  technique,
  className,
}: {
  technique: WorkoutTechnique | null | undefined;
  className?: string;
}) {
  if (!technique) return null;
  const Icon = TECHNIQUE_ICONS[technique];
  return <Icon className={className} aria-hidden />;
}

/**
 * The técnica pill: mark + PT-BR label in the technique's own pigment. `suffix`
 * carries the block size on a super/giant set ("· 3 em sequência"). The mark is
 * decorative — the label is the accessible name.
 */
export function TechniqueBadge({
  technique,
  suffix,
  className,
}: {
  technique: WorkoutTechnique | null | undefined;
  suffix?: string;
  className?: string;
}) {
  const info = techniqueInfo(technique);
  if (!info || !technique) return null;
  const Icon = TECHNIQUE_ICONS[technique];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold",
        className,
      )}
      style={{ color: info.color, backgroundColor: info.bg }}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {info.label}
      {suffix}
    </span>
  );
}
