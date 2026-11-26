"use client";

import Model, {
  type IExerciseData,
  type Muscle as HighlighterMuscle,
} from "react-body-highlighter";

import { BODY_MAP_MUSCLE_LABELS, type BodyMapMuscle } from "@/lib/exercises";
import { cn } from "@/lib/utils";

const HIGHLIGHT: Record<BodyMapMuscle, HighlighterMuscle[]> = {
  trapezius: ["trapezius"],
  "front-delts": ["front-deltoids"],
  "side-delts": ["front-deltoids", "back-deltoids"],
  "rear-delts": ["back-deltoids"],
  chest: ["chest"],
  lats: ["upper-back"],
  "upper-back": ["upper-back"],
  serratus: ["obliques"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearm: ["forearm"],
  abs: ["abs"],
  obliques: ["obliques"],
  "lower-back": ["lower-back"],
  gluteal: ["gluteal"],
  quadriceps: ["quadriceps"],
  hamstring: ["hamstring"],
  adductors: ["adductor", "abductors"],
  "hip-flexors": ["abductors"],
  calves: ["calves", "left-soleus", "right-soleus"],
  tibialis: ["calves"],
};

const FRONT = new Set<HighlighterMuscle>([
  "chest",
  "obliques",
  "abs",
  "biceps",
  "front-deltoids",
  "abductors",
  "quadriceps",
  "forearm",
]);
const BACK = new Set<HighlighterMuscle>([
  "trapezius",
  "back-deltoids",
  "upper-back",
  "triceps",
  "lower-back",
  "gluteal",
  "adductor",
  "hamstring",
  "left-soleus",
  "right-soleus",
]);

const PRIMARY = "var(--primary)";
const SECONDARY = "color-mix(in oklab, var(--primary) 35%, white)";
const BODY = "var(--border)";

function toHighlighter(muscles: readonly BodyMapMuscle[]) {
  return [...new Set(muscles.flatMap((m) => HIGHLIGHT[m] ?? []))];
}

export function ExerciseMuscleMap({
  primary,
  secondary = [],
  both = false,
  className,
}: {
  primary: readonly BodyMapMuscle[];
  secondary?: readonly BodyMapMuscle[];
  both?: boolean;
  className?: string;
}) {
  const main = toHighlighter(primary);
  const data: IExerciseData[] = [
    { name: "primary", muscles: main, frequency: 2 },
    { name: "secondary", muscles: toHighlighter(secondary), frequency: 1 },
  ];
  const front = main.filter((m) => FRONT.has(m)).length;
  const back = main.filter((m) => BACK.has(m)).length;
  const views = both
    ? (["anterior", "posterior"] as const)
    : ([back > front ? "posterior" : "anterior"] as const);
  const label = primary.length
    ? `Músculos trabalhados: ${primary.map((m) => BODY_MAP_MUSCLE_LABELS[m]).join(", ")}`
    : "Exercício sem imagem";

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center gap-[6%] bg-surface-light py-[6%]",
        className,
      )}
    >
      {views.map((type) => (
        <Model
          key={type}
          type={type}
          data={data}
          bodyColor={BODY}
          highlightedColors={[SECONDARY, PRIMARY]}
          style={{ height: "100%", aspectRatio: "1 / 2" }}
          svgStyle={{ pointerEvents: "none" }}
        />
      ))}
    </div>
  );
}
