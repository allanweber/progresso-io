import { z } from "@/lib/validation";

/**
 * Client-safe exercise-catalog domain: the DTOs the catalog screens read, the
 * zod schema the listing API validates its query with, and the PT-BR labels for
 * every enum. The enum unions/labels are duplicated here (not imported from the
 * Drizzle schema) so this module stays free of any server/database import and
 * bundles into the client pages — the same convention `lib/foods.ts` follows.
 */

export type ExerciseOrigin = "base" | "clinic";

export type ExerciseCategory =
  | "strength"
  | "stretching"
  | "plyometrics"
  | "strongman"
  | "powerlifting"
  | "cardio"
  | "olympic_weightlifting";

export type ExerciseLevel = "beginner" | "intermediate" | "expert";
export type ExerciseForce = "pull" | "push" | "static";
export type ExerciseMechanic = "compound" | "isolation";
export type ExerciseEquipment =
  | "body_only"
  | "machine"
  | "other"
  | "foam_roll"
  | "kettlebells"
  | "dumbbell"
  | "cable"
  | "barbell"
  | "bands"
  | "medicine_ball"
  | "exercise_ball"
  | "e_z_curl_bar";
export type Muscle =
  | "abdominals"
  | "abductors"
  | "adductors"
  | "biceps"
  | "calves"
  | "chest"
  | "forearms"
  | "glutes"
  | "hamstrings"
  | "lats"
  | "lower_back"
  | "middle_back"
  | "neck"
  | "quadriceps"
  | "shoulders"
  | "triceps"
  | "traps";

/* ------------------------------- PT-BR labels ----------------------------- */

export const ORIGIN_LABELS: Record<ExerciseOrigin, string> = {
  base: "base",
  clinic: "próprio",
};

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Força",
  stretching: "Alongamento",
  plyometrics: "Pliometria",
  strongman: "Strongman",
  powerlifting: "Powerlifting",
  cardio: "Cardio",
  olympic_weightlifting: "Levantamento olímpico",
};

export const LEVEL_LABELS: Record<ExerciseLevel, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  expert: "Avançado",
};

export const FORCE_LABELS: Record<ExerciseForce, string> = {
  pull: "Puxar",
  push: "Empurrar",
  static: "Estático",
};

export const MECHANIC_LABELS: Record<ExerciseMechanic, string> = {
  compound: "Composto",
  isolation: "Isolado",
};

export const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  body_only: "Peso do corpo",
  machine: "Máquina",
  other: "Outros",
  foam_roll: "Rolo de espuma",
  kettlebells: "Kettlebell",
  dumbbell: "Halteres",
  cable: "Cabo",
  barbell: "Barra",
  bands: "Faixas elásticas",
  medicine_ball: "Bola medicinal",
  exercise_ball: "Bola de exercício",
  e_z_curl_bar: "Barra W",
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  abdominals: "Abdômen",
  abductors: "Abdutores",
  adductors: "Adutores",
  biceps: "Bíceps",
  calves: "Panturrilhas",
  chest: "Peito",
  forearms: "Antebraços",
  glutes: "Glúteos",
  hamstrings: "Posteriores de coxa",
  lats: "Dorsais",
  lower_back: "Lombar",
  middle_back: "Meio das costas",
  neck: "Pescoço",
  quadriceps: "Quadríceps",
  shoulders: "Ombros",
  traps: "Trapézio",
  triceps: "Tríceps",
};

/** Filter option lists (value + PT-BR label), sorted by label for the selects. */
function optionsFrom<K extends string>(labels: Record<K, string>) {
  return (Object.keys(labels) as K[])
    .map((value) => ({ value, label: labels[value] }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export const CATEGORY_OPTIONS = optionsFrom(CATEGORY_LABELS);
export const LEVEL_OPTIONS: { value: ExerciseLevel; label: string }[] = [
  { value: "beginner", label: LEVEL_LABELS.beginner },
  { value: "intermediate", label: LEVEL_LABELS.intermediate },
  { value: "expert", label: LEVEL_LABELS.expert },
];
export const EQUIPMENT_OPTIONS = optionsFrom(EQUIPMENT_LABELS);
export const MUSCLE_OPTIONS = optionsFrom(MUSCLE_LABELS);

/* ------------------------------- image URLs ------------------------------- */

// Where exercise images are served from. In production this is the Cloudflare R2
// custom domain (set NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL). When unset — local dev
// without the bucket — we fall back to the free-exercise-db CDN, which serves the
// exact same image keys, so the catalog still shows images out of the box.
// Normalize the configured base: trim a trailing slash and, if the scheme is
// missing (a bare domain like "images.example.dev"), assume https — otherwise
// the browser would read it as a relative path and the image would 404.
function normalizeBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return /^https?:\/\//.test(base) ? base : `https://${base}`;
}
const IMAGE_BASE = normalizeBase(process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE_URL);
const IMAGE_FALLBACK =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

/** Resolves a relative image key ("<code>/0.jpg") to a full URL. */
export function exerciseImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return `${IMAGE_BASE || IMAGE_FALLBACK}/${key}`;
}

/* --------------------------------- query ---------------------------------- */

const CATEGORY_VALUES = [
  "strength",
  "stretching",
  "plyometrics",
  "strongman",
  "powerlifting",
  "cardio",
  "olympic_weightlifting",
] as const;
const LEVEL_VALUES = ["beginner", "intermediate", "expert"] as const;
const FORCE_VALUES = ["pull", "push", "static"] as const;
const MECHANIC_VALUES = ["compound", "isolation"] as const;
const EQUIPMENT_VALUES = [
  "body_only",
  "machine",
  "other",
  "foam_roll",
  "kettlebells",
  "dumbbell",
  "cable",
  "barbell",
  "bands",
  "medicine_ball",
  "exercise_ball",
  "e_z_curl_bar",
] as const;
const MUSCLE_VALUES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower_back",
  "middle_back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

/**
 * Query for the exercise listing. All optional; `page`/`pageSize` are coerced
 * from the query string. Validated on the server before hitting the DAL.
 */
export const exerciseListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  level: z.enum(LEVEL_VALUES).optional(),
  equipment: z.enum(EQUIPMENT_VALUES).optional(),
  muscle: z.enum(MUSCLE_VALUES).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type ExerciseListQuery = z.output<typeof exerciseListQuerySchema>;

/**
 * Body for adding a base substitution rule to an exercise (admin only). Unlike
 * food substitutions there is no `grams` — an exercise swap is a plain link.
 */
export const exerciseSubstitutionFormSchema = z.object({
  substituteExerciseId: z.string().uuid("Exercício substituto inválido."),
});
export type ExerciseSubstitutionForm = z.output<
  typeof exerciseSubstitutionFormSchema
>;

/* ------------------------ create/edit an exercise ------------------------- */

/**
 * An optional enum select: the form sends "" when nothing is chosen, which
 * becomes null. Kept as a `"" | enum` union (not a preprocess) so the schema's
 * INPUT type stays a plain string — TanStack Form matches its field values
 * against that input type, and an `unknown` input (what preprocess yields) would
 * not line up. Everything the catalog captures is a fixed enum — only the name,
 * description and steps are free text (per the project rule).
 */
function optionalEnum<T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) {
  return z
    .union([z.literal(""), z.enum(values, { error: message })])
    .transform((v) => (v === "" ? null : v));
}

/**
 * The create/edit form for a custom exercise, shared by the coach library and
 * the admin base catalog and validated identically on both write routes. Free
 * text is limited to `name`, `description` and the `instructions` steps; every
 * other field is constrained to its enum. `images` holds already-uploaded R2
 * keys (max 2). The DAL derives origin/tenant — never the payload.
 */
export const exerciseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do exercício.")
    .max(200, "Nome muito longo."),
  description: z
    .string()
    .trim()
    .max(2000, "Descrição muito longa.")
    .transform((v) => (v === "" ? null : v)),
  category: z.enum(CATEGORY_VALUES, { error: "Selecione uma categoria." }),
  level: z.enum(LEVEL_VALUES, { error: "Selecione um nível." }),
  force: optionalEnum(FORCE_VALUES, "Força inválida."),
  mechanic: optionalEnum(MECHANIC_VALUES, "Mecânica inválida."),
  equipment: optionalEnum(EQUIPMENT_VALUES, "Equipamento inválido."),
  primaryMuscles: z
    .array(z.enum(MUSCLE_VALUES))
    .max(MUSCLE_VALUES.length, "Músculos inválidos."),
  secondaryMuscles: z
    .array(z.enum(MUSCLE_VALUES))
    .max(MUSCLE_VALUES.length, "Músculos inválidos."),
  instructions: z
    .array(z.string().trim().min(1, "Passo vazio.").max(2000, "Passo muito longo."))
    .max(40, "Passos demais."),
  images: z
    .array(z.string().trim().min(1).max(300))
    .max(2, "No máximo duas imagens."),
});
export type ExerciseFormValues = z.output<typeof exerciseFormSchema>;

/** The subset of a created/updated exercise the client needs (to navigate). */
export type ExerciseMutationResponse = { exercise: { id: string } };

/* ---------------------------------- DTOs ---------------------------------- */

/** A row in the exercise listing (identity + the facets the cards show). */
export type ExerciseListItemDto = {
  id: string;
  code: string | null;
  name: string;
  category: ExerciseCategory;
  level: ExerciseLevel;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  origin: ExerciseOrigin;
  /** First image key ("<code>/0.jpg"); resolve with {@link exerciseImageUrl}. */
  thumbnail: string | null;
};

export type ExerciseListResponse = {
  items: ExerciseListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** A substitute exercise shown on the detail page. */
export type ExerciseSubstituteDto = {
  /** The substitution rule id. */
  id: string;
  /** The substitute exercise's id (to link to its detail). */
  exerciseId: string;
  name: string;
  code: string | null;
  category: ExerciseCategory;
  equipment: ExerciseEquipment | null;
  thumbnail: string | null;
  origin: ExerciseOrigin;
  /** Whether the viewer may delete this rule (own clinic rule; base is read-only). */
  removable: boolean;
};

/** An exercise's detail page. */
export type ExerciseDetailDto = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  category: ExerciseCategory;
  level: ExerciseLevel;
  force: ExerciseForce | null;
  mechanic: ExerciseMechanic | null;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
  images: string[];
  origin: ExerciseOrigin;
  archived: boolean;
  substitutes: ExerciseSubstituteDto[];
};
