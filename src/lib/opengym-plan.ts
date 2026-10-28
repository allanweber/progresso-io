import type { ExerciseCategory, ExerciseEquipment, Muscle } from "@/lib/exercises";
import {
  formatReps,
  normalizeReps,
  type WorkoutDetailDto,
  type WorkoutExerciseDto,
} from "@/lib/workouts";
import { WORKOUT_TECHNIQUE_CATALOG } from "@/lib/workout-techniques";

export type OpenGymUnit = "kg" | "lb";

export type OpenGymIntensifier =
  | { type: "dropset"; count: number; pct: number }
  | { type: "restpause"; totalReps: number; restSec: number };

export type OpenGymPlanExercise = {
  id: string;
  sets: number;
  mode?: "time";
  sec?: number;
  reps?: number;
  repsMin?: number;
  pyramid?: number[];
  weight?: number;
  lastToFailure?: true;
  restSec?: number;
  restOff?: true;
  subs?: string[];
  sg?: string;
  note?: string;
  intensifier?: OpenGymIntensifier;
};

export type OpenGymCustomExercise = {
  id: string;
  n: string;
  bp: string;
  eq?: string;
  tg?: string;
  primaries?: string[];
  secondaries?: string[];
  muscleGroups?: string[];
  desc?: string;
};

export type OpenGymPlan = {
  opengym_plan: 1;
  exported: string;
  name: string;
  unit: OpenGymUnit;
  week: Record<string, never>;
  routines: { id: string; name: string; ex: OpenGymPlanExercise[] }[];
  customEx: OpenGymCustomExercise[];
};

export type OpenGymExportSummary = {
  workout: string[];
  exercises: { session: string; exercise: string; items: string[] }[];
  customExercises: string[];
};

export type OpenGymExportResponse = {
  fileName: string;
  plan: OpenGymPlan;
  summary: OpenGymExportSummary;
};

export type OpenGymExerciseInfo = {
  openGymId: string | null;
  name: string;
  description: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
};

const LB_IN_KG = 0.45359237;
const DROP_PCT = 20;
const REST_PAUSE_REST_SEC = 15;
const NOTE_SEPARATOR = " · ";

const OPENGYM_MUSCLE: Record<Muscle, string | null> = {
  abdominals: "abs",
  abductors: "gluteal",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearm",
  glutes: "gluteal",
  hamstrings: "hamstring",
  lats: "upper-back",
  lower_back: "lower-back",
  middle_back: "upper-back",
  neck: null,
  quadriceps: "quadriceps",
  shoulders: "deltoids",
  traps: "trapezius",
  triceps: "triceps",
};

const OPENGYM_BODY_PART: Record<Muscle, string> = {
  abdominals: "waist",
  abductors: "upper legs",
  adductors: "upper legs",
  biceps: "upper arms",
  calves: "lower legs",
  chest: "chest",
  forearms: "lower arms",
  glutes: "upper legs",
  hamstrings: "upper legs",
  lats: "back",
  lower_back: "back",
  middle_back: "back",
  neck: "neck",
  quadriceps: "upper legs",
  shoulders: "shoulders",
  traps: "back",
  triceps: "upper arms",
};

const OPENGYM_EQUIPMENT: Record<ExerciseEquipment, string | null> = {
  body_only: "body weight",
  machine: "leverage machine",
  other: null,
  foam_roll: "roller",
  kettlebells: "kettlebell",
  dumbbell: "dumbbell",
  cable: "cable",
  barbell: "barbell",
  bands: "band",
  medicine_ball: "medicine ball",
  exercise_ball: "stability ball",
  e_z_curl_bar: "ez barbell",
};

const LOAD_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|kgs|quilos?|lb|lbs)\.?\s*$/i;

function parseLoad(load: string): { value: number; unit: OpenGymUnit } | null {
  const m = LOAD_RE.exec(load);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  if (!(value > 0)) return null;
  return { value, unit: m[2].toLowerCase().startsWith("l") ? "lb" : "kg" };
}

function convert(value: number, from: OpenGymUnit, to: OpenGymUnit): number {
  if (from === to) return value;
  const kg = from === "lb" ? value * LB_IN_KG : value / LB_IN_KG;
  return Math.round(kg * 100) / 100;
}

function planUnit(workout: Pick<WorkoutDetailDto, "sessions">): OpenGymUnit {
  for (const s of workout.sessions) {
    for (const e of s.exercises) {
      const parsed = e.load ? parseLoad(e.load) : null;
      if (parsed) return parsed.unit;
    }
  }
  return "kg";
}

function openGymMuscles(list: Muscle[]): string[] {
  const out: string[] = [];
  for (const m of list) {
    const mapped = OPENGYM_MUSCLE[m];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function customExercise(id: string, info: OpenGymExerciseInfo): OpenGymCustomExercise {
  const primaries = openGymMuscles(info.primaryMuscles);
  const secondaries = openGymMuscles(info.secondaryMuscles).filter(
    (m) => !primaries.includes(m),
  );
  const first = info.primaryMuscles[0];
  const bp = info.category === "cardio" ? "cardio" : first ? OPENGYM_BODY_PART[first] : "full body";
  const eq = info.equipment ? OPENGYM_EQUIPMENT[info.equipment] : null;
  const desc = info.description?.trim() || info.instructions.join("\n");
  return {
    id,
    n: info.name,
    bp,
    ...(eq ? { eq } : {}),
    ...(primaries[0] ? { tg: primaries[0] } : {}),
    ...(primaries.length ? { primaries } : {}),
    ...(secondaries.length ? { secondaries } : {}),
    ...(primaries.length || secondaries.length
      ? { muscleGroups: [...primaries, ...secondaries] }
      : {}),
    ...(desc ? { desc } : {}),
  };
}

export function openGymFileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "treino"}.opengym.json`;
}

export function buildOpenGymPlan(
  workout: Pick<WorkoutDetailDto, "name" | "notes" | "cardio" | "sessions">,
  exercises: Map<string, OpenGymExerciseInfo>,
  today: string,
): OpenGymExportResponse {
  const unit = planUnit(workout);
  const customEx: OpenGymCustomExercise[] = [];
  const customIdByExercise = new Map<string, string>();
  const summary: OpenGymExportSummary = { workout: [], exercises: [], customExercises: [] };
  if (workout.notes?.trim()) summary.workout.push("Observações do treino não exportadas.");
  if (workout.cardio?.trim()) summary.workout.push(`Cardio não exportado: ${workout.cardio.trim()}`);

  const idFor = (exerciseId: string, info: OpenGymExerciseInfo): string => {
    if (info.openGymId) return info.openGymId;
    const existing = customIdByExercise.get(exerciseId);
    if (existing) return existing;
    const id = `progresso-${exerciseId}`;
    customIdByExercise.set(exerciseId, id);
    customEx.push(customExercise(id, info));
    summary.customExercises.push(info.name);
    return id;
  };

  const groupIds = new Map<string, string>();
  const routines = workout.sessions.map((session) => {
    const ex: OpenGymPlanExercise[] = [];
    for (const item of session.exercises) {
      const info = item.available ? exercises.get(item.exerciseId) : undefined;
      if (!info) {
        summary.exercises.push({
          session: session.name,
          exercise: item.name,
          items: ["Exercício indisponível, não exportado."],
        });
        continue;
      }
      const notes: string[] = [];
      const items: string[] = [];
      const out = translateExercise(item, idFor(item.exerciseId, info), unit, notes, items);

      if (item.groupId) {
        let sg = groupIds.get(item.groupId);
        if (!sg) {
          sg = `sg${groupIds.size + 1}`;
          groupIds.set(item.groupId, sg);
        }
        out.sg = sg;
      }

      const subs: string[] = [];
      for (const s of item.substitutes) {
        const subId = exercises.get(s.exerciseId)?.openGymId;
        if (subId && subId !== out.id && !subs.includes(subId)) subs.push(subId);
        else if (!subId) items.push(`Substituto sem equivalente no openGym: ${s.name}.`);
      }
      if (subs.length) out.subs = subs;

      const note = [item.note?.trim(), ...notes].filter(Boolean).join(NOTE_SEPARATOR);
      if (note) out.note = note;
      if (items.length) summary.exercises.push({ session: session.name, exercise: item.name, items });
      ex.push(out);
    }
    return { id: session.id, name: session.name, ex };
  });

  return {
    fileName: openGymFileName(workout.name),
    plan: {
      opengym_plan: 1,
      exported: today,
      name: workout.name,
      unit,
      week: {},
      routines,
      customEx,
    },
    summary,
  };
}

function translateExercise(
  item: WorkoutExerciseDto,
  id: string,
  unit: OpenGymUnit,
  notes: string[],
  items: string[],
): OpenGymPlanExercise {
  const reps = normalizeReps(item.reps);
  const out: OpenGymPlanExercise = { id, sets: item.sets };

  switch (reps.kind) {
    case "fixed":
      out.reps = reps.value;
      break;
    case "range": {
      const min = Math.min(...reps.values);
      const max = Math.max(...reps.values);
      out.reps = max;
      if (min < max) out.repsMin = min;
      if (reps.values.length > 2) {
        notes.push(`Repetições: ${formatReps(reps)}`);
        items.push(`Sequência de repetições ${formatReps(reps)} exportada como faixa ${min}-${max}; a sequência foi para a observação.`);
      }
      break;
    }
    case "pyramid":
      out.pyramid = reps.values;
      out.sets = reps.values.length;
      break;
    case "duration":
      out.mode = "time";
      out.sec = reps.seconds;
      break;
    case "failure":
      out.lastToFailure = true;
      notes.push("Todas as séries até a falha");
      items.push("“Falha” exportada como última série até a falha; o restante foi para a observação.");
      break;
  }

  if (item.load?.trim()) {
    const parsed = parseLoad(item.load);
    if (parsed) {
      out.weight = convert(parsed.value, parsed.unit, unit);
      if (parsed.unit !== unit) {
        items.push(`Carga convertida de ${item.load.trim()} para ${out.weight} ${unit}.`);
      }
    } else {
      notes.push(`Carga: ${item.load.trim()}`);
      items.push(`Carga “${item.load.trim()}” foi para a observação.`);
    }
  }

  if (item.rest > 0) out.restSec = item.rest;
  else out.restOff = true;

  switch (item.technique) {
    case "dropset":
      out.intensifier = { type: "dropset", count: 1, pct: DROP_PCT };
      break;
    case "tripledrop":
      out.intensifier = { type: "dropset", count: 3, pct: DROP_PCT };
      break;
    case "restpause": {
      const total =
        reps.kind === "fixed"
          ? reps.value
          : reps.kind === "range" || reps.kind === "pyramid"
            ? Math.max(...reps.values)
            : null;
      if (total) {
        out.intensifier = { type: "restpause", totalReps: total, restSec: REST_PAUSE_REST_SEC };
        items.push("Rest-pause no openGym vira 1 série de aquecimento + 1 série rest-pause.");
      } else {
        notes.push(`Técnica: ${WORKOUT_TECHNIQUE_CATALOG.restpause.label}`);
        items.push("Rest-pause sem repetições numéricas foi para a observação.");
      }
      break;
    }
    case "gvt":
    case "fs7":
    case "cluster": {
      const label = WORKOUT_TECHNIQUE_CATALOG[item.technique].label;
      notes.push(`Técnica: ${label}`);
      items.push(`Técnica ${label} foi para a observação.`);
      break;
    }
    case "superset":
    case "giant":
      if (!item.groupId) {
        const label = WORKOUT_TECHNIQUE_CATALOG[item.technique].label;
        notes.push(`Técnica: ${label}`);
        items.push(`${label} sem grupo foi para a observação.`);
      }
      break;
    case null:
      break;
  }

  return out;
}
