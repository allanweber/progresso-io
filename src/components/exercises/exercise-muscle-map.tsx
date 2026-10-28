"use client";

import Model, {
  type IExerciseData,
  type Muscle as BodyMuscle,
} from "react-body-highlighter";

import { MUSCLE_LABELS, type Muscle } from "@/lib/exercises";
import { cn } from "@/lib/utils";

const BODY_MUSCLES: Record<Muscle, BodyMuscle[]> = {
  abdominals: ["abs", "obliques"],
  abductors: ["gluteal"],
  adductors: ["abductors", "adductor"],
  biceps: ["biceps"],
  calves: ["calves", "left-soleus", "right-soleus"],
  chest: ["chest"],
  forearms: ["forearm"],
  glutes: ["gluteal"],
  hamstrings: ["hamstring"],
  lats: ["upper-back"],
  lower_back: ["lower-back"],
  middle_back: ["upper-back"],
  neck: ["neck", "trapezius"],
  quadriceps: ["quadriceps"],
  shoulders: ["front-deltoids", "back-deltoids"],
  traps: ["trapezius"],
  triceps: ["triceps"],
};

const FRONT = new Set<BodyMuscle>([
  "chest",
  "obliques",
  "abs",
  "biceps",
  "neck",
  "front-deltoids",
  "abductors",
  "quadriceps",
  "forearm",
]);
const BACK = new Set<BodyMuscle>([
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

function toBody(muscles: Muscle[]) {
  return [...new Set(muscles.flatMap((m) => BODY_MUSCLES[m] ?? []))];
}

export function ExerciseMuscleMap({
  primary,
  secondary = [],
  both = false,
  className,
}: {
  primary: Muscle[];
  secondary?: Muscle[];
  both?: boolean;
  className?: string;
}) {
  const main = toBody(primary);
  const data: IExerciseData[] = [
    { name: "primary", muscles: main, frequency: 2 },
    { name: "secondary", muscles: toBody(secondary), frequency: 1 },
  ];
  const front = main.filter((m) => FRONT.has(m)).length;
  const back = main.filter((m) => BACK.has(m)).length;
  const views = both
    ? (["anterior", "posterior"] as const)
    : ([back > front ? "posterior" : "anterior"] as const);
  const label = primary.length
    ? `Músculos trabalhados: ${primary.map((m) => MUSCLE_LABELS[m]).join(", ")}`
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
