import type { Sex } from "@/db/schema";
import { z } from "@/lib/validation";

export const OPENGYM_COMMIT = "e4a68a94c42a3c17cbd560d66ce2e46a7048ab99";

export const EXERCISE_BODY_PARTS = [
  "back",
  "cardio",
  "chest",
  "lower arms",
  "lower legs",
  "neck",
  "shoulders",
  "upper arms",
  "upper legs",
  "waist",
  "full body",
] as const;
export type ExerciseBodyPart = (typeof EXERCISE_BODY_PARTS)[number];

export const EXERCISE_EQUIPMENT = [
  "body weight",
  "dumbbell",
  "cable",
  "barbell",
  "leverage machine",
  "band",
  "smith machine",
  "kettlebell",
  "weighted",
  "stability ball",
  "ez barbell",
  "assisted",
  "sled machine",
  "medicine ball",
  "rope",
  "roller",
  "massage ball",
  "resistance band",
  "bosu ball",
  "olympic barbell",
  "wheel roller",
  "upper body ergometer",
  "skierg machine",
  "hammer",
  "stationary bike",
  "tire",
  "trap bar",
  "elliptical machine",
  "stepmill machine",
  "suspension trainer",
  "sandbag",
  "landmine",
  "weight plate",
  "clubbell",
  "macebell",
] as const;
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];

export const EXERCISE_MACHINE_EQUIPMENT = [
  "leverage machine",
  "sled machine",
  "smith machine",
  "assisted",
] as const satisfies readonly ExerciseEquipment[];

export const EXERCISE_MACHINE_KINDS = [
  "leg-press",
  "hack-squat",
  "squat-machine",
  "belt-squat",
  "leg-extension",
  "leg-curl",
  "calf-raise",
  "hip-thrust",
  "hip-abduction",
  "glute-machine",
  "chest-press",
  "pec-deck",
  "shoulder-press",
  "lateral-raise",
  "triceps-machine",
  "lat-pulldown",
  "seated-row",
  "t-bar-row",
  "biceps-curl",
  "back-extension",
  "smith",
  "assisted-pullup",
  "ab-machine",
  "push-sled",
  "cardio",
  "pilates",
  "other",
  "none",
] as const;
export type ExerciseMachineKind = (typeof EXERCISE_MACHINE_KINDS)[number];

export const EXERCISE_TARGETS = [
  "abs",
  "pectorals",
  "biceps",
  "glutes",
  "front delts",
  "side delts",
  "rear delts",
  "delts",
  "triceps",
  "upper back",
  "lats",
  "calves",
  "quads",
  "forearms",
  "cardiovascular system",
  "hamstrings",
  "spine",
  "traps",
  "adductors",
  "serratus anterior",
  "abductors",
  "levator scapulae",
  "obliques",
  "hip flexors",
  "shins",
] as const;
export type ExerciseTarget = (typeof EXERCISE_TARGETS)[number];

export const EXERCISE_SECONDARY_MUSCLES = [
  "front delts",
  "side delts",
  "rear delts",
  "shoulders",
  "deltoids",
  "rear deltoids",
  "rotator cuff",
  "chest",
  "upper chest",
  "triceps",
  "biceps",
  "brachialis",
  "forearms",
  "wrists",
  "wrist flexors",
  "wrist extensors",
  "grip muscles",
  "back",
  "upper back",
  "lats",
  "latissimus dorsi",
  "rhomboids",
  "trapezius",
  "traps",
  "lower back",
  "core",
  "abdominals",
  "obliques",
  "lower abs",
  "hip flexors",
  "glutes",
  "quadriceps",
  "hamstrings",
  "adductors",
  "inner thighs",
  "groin",
  "calves",
  "soleus",
  "shins",
  "ankles",
  "ankle stabilizers",
  "feet",
  "hands",
  "sternocleidomastoid",
] as const;
export type ExerciseSecondaryMuscle =
  (typeof EXERCISE_SECONDARY_MUSCLES)[number];

export const EXERCISE_CATEGORIES = [
  "strength",
  "stretching",
  "mobility",
  "plyometrics",
  "cardio",
  "olympic",
  "calisthenics",
  "pilates",
  "yoga",
  "combat",
  "isometric",
  "rehab",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_NEEDS = ["bench", "pull-up bar"] as const;
export type ExerciseNeed = (typeof EXERCISE_NEEDS)[number];

export const EXERCISE_TRACKS = ["distance"] as const;
export type ExerciseTrack = (typeof EXERCISE_TRACKS)[number];

export const BODY_MAP_MUSCLES = [
  "trapezius",
  "front-delts",
  "side-delts",
  "rear-delts",
  "chest",
  "lats",
  "upper-back",
  "serratus",
  "biceps",
  "triceps",
  "forearm",
  "abs",
  "obliques",
  "lower-back",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "hip-flexors",
  "calves",
  "tibialis",
] as const;
export type BodyMapMuscle = (typeof BODY_MAP_MUSCLES)[number];

export type ExerciseOrigin = "base" | "clinic";

export const ORIGIN_LABELS: Record<ExerciseOrigin, string> = {
  base: "base",
  clinic: "próprio",
};

export const BODY_PART_LABELS: Record<ExerciseBodyPart, string> = {
  back: "Costas",
  cardio: "Cardio",
  chest: "Peito",
  "lower arms": "Antebraços",
  "lower legs": "Panturrilhas e canelas",
  neck: "Pescoço",
  shoulders: "Ombros",
  "upper arms": "Braços",
  "upper legs": "Coxas e glúteos",
  waist: "Abdômen",
  "full body": "Corpo inteiro",
};

export const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  "body weight": "Peso corporal",
  dumbbell: "Halteres",
  cable: "Polia",
  barbell: "Barra",
  "leverage machine": "Máquina articulada",
  band: "Elástico",
  "smith machine": "Smith",
  kettlebell: "Kettlebell",
  weighted: "Com sobrecarga",
  "stability ball": "Bola suíça",
  "ez barbell": "Barra W",
  assisted: "Assistido",
  "sled machine": "Máquina de trilho",
  "medicine ball": "Bola medicinal",
  rope: "Corda",
  roller: "Rolo de liberação",
  "massage ball": "Bola de massagem",
  "resistance band": "Faixa elástica",
  "bosu ball": "Bosu",
  "olympic barbell": "Barra olímpica",
  "wheel roller": "Roda abdominal",
  "upper body ergometer": "Ergômetro de braços",
  "skierg machine": "SkiErg",
  hammer: "Marreta",
  "stationary bike": "Bicicleta ergométrica",
  tire: "Pneu",
  "trap bar": "Barra hexagonal",
  "elliptical machine": "Elíptico",
  "stepmill machine": "Simulador de escada",
  "suspension trainer": "Fita de suspensão",
  sandbag: "Saco de areia",
  landmine: "Landmine",
  "weight plate": "Anilha",
  clubbell: "Clubbell",
  macebell: "Macebell",
};

export const MACHINE_KIND_LABELS: Record<ExerciseMachineKind, string> = {
  "leg-press": "Leg press",
  "hack-squat": "Hack squat",
  "squat-machine": "Máquina de agachamento",
  "belt-squat": "Belt squat",
  "leg-extension": "Cadeira extensora",
  "leg-curl": "Mesa ou cadeira flexora",
  "calf-raise": "Máquina de panturrilha",
  "hip-thrust": "Máquina de elevação pélvica",
  "hip-abduction": "Cadeira abdutora",
  "glute-machine": "Máquina de glúteos",
  "chest-press": "Supino máquina",
  "pec-deck": "Peck deck",
  "shoulder-press": "Desenvolvimento máquina",
  "lateral-raise": "Elevação lateral máquina",
  "triceps-machine": "Máquina de tríceps",
  "lat-pulldown": "Puxada no pulley",
  "seated-row": "Remada sentada",
  "t-bar-row": "Remada cavalinho",
  "biceps-curl": "Rosca máquina",
  "back-extension": "Banco de extensão lombar",
  smith: "Smith",
  "assisted-pullup": "Barra assistida",
  "ab-machine": "Máquina de abdominal",
  "push-sled": "Trenó",
  cardio: "Aparelho de cardio",
  pilates: "Aparelho de pilates",
  other: "Outra máquina",
  none: "Sem máquina",
};

export const TARGET_LABELS: Record<ExerciseTarget, string> = {
  abs: "Abdômen",
  pectorals: "Peitoral",
  biceps: "Bíceps",
  glutes: "Glúteos",
  "front delts": "Deltoide anterior",
  "side delts": "Deltoide lateral",
  "rear delts": "Deltoide posterior",
  delts: "Deltoides",
  triceps: "Tríceps",
  "upper back": "Parte superior das costas",
  lats: "Dorsais",
  calves: "Panturrilhas",
  quads: "Quadríceps",
  forearms: "Antebraços",
  "cardiovascular system": "Sistema cardiovascular",
  hamstrings: "Posteriores de coxa",
  spine: "Eretores da coluna",
  traps: "Trapézio",
  adductors: "Adutores",
  "serratus anterior": "Serrátil anterior",
  abductors: "Abdutores",
  "levator scapulae": "Levantador da escápula",
  obliques: "Oblíquos",
  "hip flexors": "Flexores do quadril",
  shins: "Tibial anterior",
};

export const SECONDARY_MUSCLE_LABELS: Record<ExerciseSecondaryMuscle, string> = {
  "front delts": "Deltoide anterior",
  "side delts": "Deltoide lateral",
  "rear delts": "Deltoide posterior",
  shoulders: "Ombros",
  deltoids: "Deltoides",
  "rear deltoids": "Deltoide posterior",
  "rotator cuff": "Manguito rotador",
  chest: "Peito",
  "upper chest": "Peitoral superior",
  triceps: "Tríceps",
  biceps: "Bíceps",
  brachialis: "Braquial",
  forearms: "Antebraços",
  wrists: "Punhos",
  "wrist flexors": "Flexores do punho",
  "wrist extensors": "Extensores do punho",
  "grip muscles": "Musculatura da pegada",
  back: "Costas",
  "upper back": "Parte superior das costas",
  lats: "Dorsais",
  "latissimus dorsi": "Latíssimo do dorso",
  rhomboids: "Romboides",
  trapezius: "Trapézio",
  traps: "Trapézio",
  "lower back": "Lombar",
  core: "Core",
  abdominals: "Abdômen",
  obliques: "Oblíquos",
  "lower abs": "Abdômen inferior",
  "hip flexors": "Flexores do quadril",
  glutes: "Glúteos",
  quadriceps: "Quadríceps",
  hamstrings: "Posteriores de coxa",
  adductors: "Adutores",
  "inner thighs": "Parte interna da coxa",
  groin: "Virilha",
  calves: "Panturrilhas",
  soleus: "Sóleo",
  shins: "Canelas",
  ankles: "Tornozelos",
  "ankle stabilizers": "Estabilizadores do tornozelo",
  feet: "Pés",
  hands: "Mãos",
  sternocleidomastoid: "Esternocleidomastoideo",
};

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Força",
  stretching: "Alongamento",
  mobility: "Mobilidade",
  plyometrics: "Pliometria",
  cardio: "Cardio",
  olympic: "Levantamento olímpico",
  calisthenics: "Calistenia",
  pilates: "Pilates",
  yoga: "Yoga",
  combat: "Luta",
  isometric: "Isometria",
  rehab: "Reabilitação",
};

export const NEED_LABELS: Record<ExerciseNeed, string> = {
  bench: "Banco",
  "pull-up bar": "Barra fixa",
};

export const BODY_MAP_MUSCLE_LABELS: Record<BodyMapMuscle, string> = {
  trapezius: "Trapézio",
  "front-delts": "Deltoide anterior",
  "side-delts": "Deltoide lateral",
  "rear-delts": "Deltoide posterior",
  chest: "Peito",
  lats: "Dorsais",
  "upper-back": "Parte superior das costas",
  serratus: "Serrátil",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearm: "Antebraços",
  abs: "Abdômen",
  obliques: "Oblíquos",
  "lower-back": "Lombar",
  gluteal: "Glúteos",
  quadriceps: "Quadríceps",
  hamstring: "Posteriores de coxa",
  adductors: "Adutores",
  "hip-flexors": "Flexores do quadril",
  calves: "Panturrilhas",
  tibialis: "Tibial anterior",
};

function optionsFrom<K extends string>(labels: Record<K, string>) {
  return (Object.keys(labels) as K[])
    .map((value) => ({ value, label: labels[value] }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const BODY_PART_OPTIONS = optionsFrom(BODY_PART_LABELS);
export const CATEGORY_OPTIONS = optionsFrom(CATEGORY_LABELS);
export const EQUIPMENT_OPTIONS = optionsFrom(EQUIPMENT_LABELS);
export const MACHINE_KIND_OPTIONS = optionsFrom(MACHINE_KIND_LABELS);
export const TARGET_OPTIONS = optionsFrom(TARGET_LABELS);
export const SECONDARY_MUSCLE_OPTIONS = optionsFrom(SECONDARY_MUSCLE_LABELS);
export const NEED_OPTIONS = optionsFrom(NEED_LABELS);

export function isMachineEquipment(equipment: ExerciseEquipment): boolean {
  return (EXERCISE_MACHINE_EQUIPMENT as readonly string[]).includes(equipment);
}

const BODY_MAP_ALIAS: Record<string, BodyMapMuscle[]> = {
  abs: ["abs"],
  pectorals: ["chest"],
  biceps: ["biceps"],
  glutes: ["gluteal"],
  delts: ["front-delts", "side-delts", "rear-delts"],
  "front delts": ["front-delts"],
  "side delts": ["side-delts"],
  "rear delts": ["rear-delts"],
  triceps: ["triceps"],
  "upper back": ["upper-back"],
  lats: ["lats"],
  calves: ["calves"],
  quads: ["quadriceps"],
  forearms: ["forearm"],
  hamstrings: ["hamstring"],
  spine: ["lower-back"],
  traps: ["trapezius"],
  adductors: ["adductors"],
  "serratus anterior": ["serratus"],
  abductors: ["gluteal"],
  "levator scapulae": ["trapezius"],
  shoulders: ["front-delts", "side-delts", "rear-delts"],
  deltoids: ["front-delts", "side-delts", "rear-delts"],
  "rear deltoids": ["rear-delts"],
  "rotator cuff": ["rear-delts"],
  quadriceps: ["quadriceps"],
  core: ["abs"],
  abdominals: ["abs"],
  "lower abs": ["abs"],
  chest: ["chest"],
  "upper chest": ["chest"],
  "hip flexors": ["hip-flexors"],
  obliques: ["obliques"],
  "lower back": ["lower-back"],
  rhomboids: ["upper-back"],
  trapezius: ["trapezius"],
  back: ["upper-back"],
  "latissimus dorsi": ["lats"],
  brachialis: ["biceps"],
  soleus: ["calves"],
  shins: ["tibialis"],
  wrists: ["forearm"],
  "wrist flexors": ["forearm"],
  "wrist extensors": ["forearm"],
  "grip muscles": ["forearm"],
  groin: ["adductors"],
  "inner thighs": ["adductors"],
};

export function bodyMapOf(
  target: string,
  secondaryMuscles: readonly string[],
): { primaries: BodyMapMuscle[]; secondaries: BodyMapMuscle[] } {
  const primaries = [...new Set(BODY_MAP_ALIAS[target] ?? [])];
  const secondaries = [
    ...new Set(secondaryMuscles.flatMap((m) => BODY_MAP_ALIAS[m] ?? [])),
  ].filter((m) => !primaries.includes(m));
  return { primaries, secondaries };
}

export function muscleWeightsFor(map: {
  primaries: readonly BodyMapMuscle[];
  secondaries: readonly BodyMapMuscle[];
}): Partial<Record<BodyMapMuscle, number>> {
  const weights: Partial<Record<BodyMapMuscle, number>> = {};
  for (const m of map.secondaries) weights[m] = 0.4;
  for (const m of map.primaries) weights[m] = 1;
  return weights;
}

export type MuscleShare = {
  muscle: BodyMapMuscle;
  label: string;
  percent: number;
  primary: boolean;
};

export function muscleShares(
  primaries: readonly BodyMapMuscle[],
  secondaries: readonly BodyMapMuscle[],
  weights: Partial<Record<BodyMapMuscle, number>>,
): MuscleShare[] {
  const list = [
    ...primaries.map((m) => ({ muscle: m, primary: true })),
    ...secondaries.map((m) => ({ muscle: m, primary: false })),
  ].filter((m) => (weights[m.muscle] ?? 0) > 0);
  const total = list.reduce((sum, m) => sum + (weights[m.muscle] ?? 0), 0);
  return list.map((m) => ({
    ...m,
    label: BODY_MAP_MUSCLE_LABELS[m.muscle],
    percent: total > 0 ? Math.round(((weights[m.muscle] ?? 0) / total) * 100) : 0,
  }));
}

function normalizeBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return /^https?:\/\//.test(base) ? base : `https://${base}`;
}
const MEDIA_BASE = normalizeBase(process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL);

export function exerciseMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  if (!MEDIA_BASE) return null;
  return `${MEDIA_BASE}/${key}`;
}

export type ExerciseMedia = {
  image: string | null;
  video: string | null;
};

export type ExerciseMediaSet = ExerciseMedia & {
  femaleImage: string | null;
  femaleVideo: string | null;
};

export function mediaForSex(
  media: ExerciseMediaSet,
  sex: Sex | null | undefined,
): ExerciseMedia {
  if (sex === "feminino" && (media.femaleImage || media.femaleVideo)) {
    return { image: media.femaleImage, video: media.femaleVideo };
  }
  return { image: media.image, video: media.video };
}

export const exerciseListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  bodyPart: z.enum(EXERCISE_BODY_PARTS).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  equipment: z.enum(EXERCISE_EQUIPMENT).optional(),
  target: z.enum(EXERCISE_TARGETS).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type ExerciseListQuery = z.output<typeof exerciseListQuerySchema>;

export const exerciseSubstitutionFormSchema = z.object({
  substituteExerciseId: z.string().uuid("Exercício substituto inválido."),
});
export type ExerciseSubstitutionForm = z.output<
  typeof exerciseSubstitutionFormSchema
>;

const nullableText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

const steps = z
  .array(z.string().trim().min(1, "Passo vazio.").max(2000, "Passo muito longo."))
  .max(40, "Passos demais.");

export const exerciseFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe o nome do exercício.")
      .max(200, "Nome muito longo."),
    nameEn: nullableText(200, "Nome muito longo."),
    description: nullableText(2000, "Descrição muito longa."),
    descriptionEn: nullableText(2000, "Descrição muito longa."),
    bodyPart: z.enum(EXERCISE_BODY_PARTS, { error: "Selecione uma região." }),
    category: z.enum(EXERCISE_CATEGORIES, { error: "Selecione uma categoria." }),
    equipment: z.enum(EXERCISE_EQUIPMENT, {
      error: "Selecione um equipamento.",
    }),
    machineKind: z
      .union([z.literal(""), z.enum(EXERCISE_MACHINE_KINDS, { error: "Máquina inválida." })])
      .transform((v) => (v === "" ? null : v)),
    target: z.enum(EXERCISE_TARGETS, { error: "Selecione o músculo principal." }),
    secondaryMuscles: z
      .array(z.enum(EXERCISE_SECONDARY_MUSCLES))
      .max(EXERCISE_SECONDARY_MUSCLES.length, "Músculos inválidos."),
    needs: z.array(z.enum(EXERCISE_NEEDS)).max(EXERCISE_NEEDS.length),
    hold: z.boolean(),
    instructions: steps,
    instructionsEn: steps,
    image: nullableText(300, "Imagem inválida."),
  })
  .superRefine((v, ctx) => {
    if (isMachineEquipment(v.equipment) && !v.machineKind) {
      ctx.addIssue({
        code: "custom",
        path: ["machineKind"],
        message: "Selecione a máquina.",
      });
    }
  })
  .transform((v) => ({
    ...v,
    machineKind: isMachineEquipment(v.equipment) ? v.machineKind : null,
  }));
export type ExerciseFormValues = z.output<typeof exerciseFormSchema>;

export type ExerciseMutationResponse = { exercise: { id: string } };

export type ExerciseListItemDto = {
  id: string;
  code: string | null;
  name: string;
  nameEn: string | null;
  bodyPart: ExerciseBodyPart;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  target: ExerciseTarget;
  origin: ExerciseOrigin;
  image: string | null;
};

export type ExerciseFacets = {
  categories: ExerciseCategory[];
  equipment: ExerciseEquipment[];
};

export type ExerciseListResponse = {
  items: ExerciseListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  facets: ExerciseFacets;
  counts: { base: number; clinic: number };
};

export type ExerciseSubstituteDto = {
  id: string;
  exerciseId: string;
  name: string;
  code: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  image: string | null;
  origin: ExerciseOrigin;
  removable: boolean;
};

export type ExerciseDetailDto = ExerciseMediaSet & {
  id: string;
  code: string | null;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  bodyPart: ExerciseBodyPart;
  category: ExerciseCategory;
  equipment: ExerciseEquipment;
  machineKind: ExerciseMachineKind | null;
  target: ExerciseTarget;
  secondaryMuscles: ExerciseSecondaryMuscle[];
  mapPrimary: BodyMapMuscle[];
  mapSecondary: BodyMapMuscle[];
  muscleWeights: Partial<Record<BodyMapMuscle, number>>;
  needs: ExerciseNeed[];
  hold: boolean;
  track: ExerciseTrack | null;
  instructions: string[];
  instructionsEn: string[];
  origin: ExerciseOrigin;
  archived: boolean;
  substitutes: ExerciseSubstituteDto[];
};
