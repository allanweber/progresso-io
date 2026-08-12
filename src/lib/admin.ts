import type {
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseForce,
  ExerciseLevel,
  ExerciseMechanic,
  ExerciseSubstituteDto,
  Muscle,
} from "@/lib/exercises";
import {
  FOOD_SORTS,
  type FoodMeasureDto,
  type FoodNutrientDto,
  type FoodSubstituteDto,
  type FoodType,
} from "@/lib/foods";
import type { AnamnesisModality, AnamnesisObjective } from "@/lib/anamneses";
import type { StudentDto } from "@/lib/students";
import { z } from "@/lib/validation";

/**
 * Client-safe admin domain: the DTOs the admin screens read and the zod schema
 * the students API validates its filters with. No server/database import, so it
 * bundles into the client page.
 */

/** A clinic as offered in the admin's clinic filter. */
export type ClinicOption = { id: string; name: string };

/**
 * A clinic row in the admin "Clínicas" manager: identity + owner + how many
 * coaches/students it holds (so the delete dialog can spell out the blast
 * radius). A superset of {@link ClinicOption}, so the id/name filters read it too.
 */
export type AdminClinicDto = {
  id: string;
  name: string;
  plan: string;
  ownerName: string | null;
  ownerEmail: string | null;
  coachCount: number;
  studentCount: number;
  createdAt: string;
};

/** A platform student row: the student plus its clinic name and access flag. */
export type AdminStudentDto = StudentDto & {
  clinicName: string;
  hasAccount: boolean;
};

/**
 * Filters for the platform-wide student list. Both optional — omitted means
 * "no filter". `clinicId` must be a real UUID; `email` is a trimmed, lowercased
 * substring. Validated on the server before hitting the admin DAL.
 */
export const adminStudentFilterSchema = z.object({
  clinicId: z.string().uuid("Clínica inválida.").optional(),
  email: z.string().trim().toLowerCase().max(200).optional(),
});

export type AdminStudentFilterValues = z.output<typeof adminStudentFilterSchema>;

/* -------------------------------------------------------------------------- */
/*  Platform admins (create / list / remove)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Invite a new platform admin. Only a name + e-mail: they set their own
 * password from the e-mailed link. Validated on the server before the DAL.
 */
export const adminInviteSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Informe um e-mail válido.")
    .max(200),
});
export type AdminInviteValues = z.output<typeof adminInviteSchema>;

/** An activated platform admin, as the Admins list renders it. */
export type AdminAccountDto = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** The signed-in admin's own row — never deletable. */
  isSelf: boolean;
  /** The env-seeded bootstrap admin (ADMIN_EMAIL) — never deletable. */
  isBootstrap: boolean;
};

/** A pending (not-yet-accepted) admin invite. */
export type AdminInviteDto = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * The Admins page payload: activated admins and outstanding invites. `total`
 * counts activated admins only — the UI disables every delete when it's 1 (the
 * last admin can't be removed).
 */
export type AdminListResponse = {
  admins: AdminAccountDto[];
  invites: AdminInviteDto[];
  total: number;
};

/* -------------------------------------------------------------------------- */
/*  Food catalog — platform admin (phase 3)                                    */
/* -------------------------------------------------------------------------- */

export type AdminFoodOrigin = "base" | "clinic";

/**
 * Query for the admin's cross-clinic food listing. `origin` narrows to the
 * shared base or to clinic-owned foods; `clinic` narrows to one clinic; `sort`
 * mirrors the coach listing's whitelist. Validated before hitting the DAL.
 */
export const adminFoodListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  group: z.string().trim().max(80).optional(),
  type: z.enum(["ingrediente", "preparacao"]).optional(),
  origin: z.enum(["base", "clinic"]).optional(),
  clinic: z.string().uuid("Clínica inválida.").optional(),
  archived: z.boolean().optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(FOOD_SORTS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type AdminFoodListQuery = z.output<typeof adminFoodListQuerySchema>;

/** A row in the admin food listing (per 100 g; hot macros + clinic). */
export type AdminFoodListItemDto = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  substituteCount: number;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
};

export type AdminFoodListResponse = {
  items: AdminFoodListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** An admin food-detail: identity + who owns it + full profile + base subs. */
export type AdminFoodDetailDto = {
  id: string;
  code: string | null;
  description: string;
  type: FoodType;
  groupName: string;
  groupSlug: string;
  origin: AdminFoodOrigin;
  clinicName: string | null;
  archived: boolean;
  energyKcal: number | null;
  protein: number | null;
  carbohydrate: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  nutrients: FoodNutrientDto[];
  substitutes: FoodSubstituteDto[];
  measures: FoodMeasureDto[];
};

/* -------------------------------------------------------------------------- */
/*  Exercise catalog — platform admin (cross-tenant browse)                    */
/* -------------------------------------------------------------------------- */

export type AdminExerciseOrigin = "base" | "clinic";

/**
 * Query for the admin's cross-clinic exercise listing. `origin` narrows to the
 * shared base or to clinic-owned exercises; `clinic` narrows to one clinic.
 * Validated before hitting the DAL.
 */
export const adminExerciseListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z
    .enum([
      "strength",
      "stretching",
      "plyometrics",
      "strongman",
      "powerlifting",
      "cardio",
      "olympic_weightlifting",
    ])
    .optional(),
  level: z.enum(["beginner", "intermediate", "expert"]).optional(),
  equipment: z
    .enum([
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
    ])
    .optional(),
  muscle: z
    .enum([
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
    ])
    .optional(),
  origin: z.enum(["base", "clinic"]).optional(),
  clinic: z.string().uuid("Clínica inválida.").optional(),
  archived: z.boolean().optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AdminExerciseListQuery = z.output<typeof adminExerciseListQuerySchema>;

/** A row in the admin exercise listing (identity + facets + clinic). */
export type AdminExerciseListItemDto = {
  id: string;
  code: string | null;
  name: string;
  category: ExerciseCategory;
  level: ExerciseLevel;
  equipment: ExerciseEquipment | null;
  primaryMuscles: Muscle[];
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  archived: boolean;
  thumbnail: string | null;
};

export type AdminExerciseListResponse = {
  items: AdminExerciseListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** An admin exercise-detail: identity + who owns it + the full record. */
export type AdminExerciseDetailDto = {
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
  origin: AdminExerciseOrigin;
  clinicName: string | null;
  archived: boolean;
  substitutes: ExerciseSubstituteDto[];
};

/* -------------------------------------------------------------------------- */
/*  Anamneses (data maintenance)                                               */
/* -------------------------------------------------------------------------- */

export type AdminAnamnesisOrigin = "system" | "clinic";

export const ADMIN_ANAMNESIS_ORIGIN_LABELS: Record<AdminAnamnesisOrigin, string> = {
  system: "Sistema",
  clinic: "Clínica",
};

/** Query for the admin's cross-clinic anamneses listing. Validated before the DAL. */
export const adminAnamnesisListQuerySchema = z.object({
  clinic: z.string().uuid().optional(),
  origin: z.enum(["system", "clinic"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AdminAnamnesisListQuery = z.output<typeof adminAnamnesisListQuerySchema>;

export type AdminAnamnesisListItemDto = {
  id: string;
  name: string;
  clinicId: string;
  clinicName: string;
  origin: AdminAnamnesisOrigin;
  sourceKey: string | null;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
  updatedAt: string;
  studentUsageCount: number;
};

export type AdminAnamnesisListResponse = {
  items: AdminAnamnesisListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** A system starter offered in the "Importar starters" dialog. */
export type AdminStarterDto = {
  key: string;
  name: string;
  objective: AnamnesisObjective;
  modality: AnamnesisModality;
};

/** Import selected starters into a clinic. */
export const adminImportStartersSchema = z.object({
  clinicId: z.string().uuid("Selecione uma clínica."),
  keys: z.array(z.string().min(1)).min(1, "Selecione ao menos uma anamnese."),
});
export type AdminImportStartersInput = z.output<typeof adminImportStartersSchema>;

export type AdminImportResult = { imported: string[]; skipped: string[] };

/* -------------------------------------------------------------------------- */
/*  Diets & workouts (data maintenance — cross-clinic)                         */
/*                                                                            */
/*  Same Sistema/Clínica model as anamneses: a diet/workout with `source_key`  */
/*  set is a seeded/imported system starter; null is coach-authored. One DTO   */
/*  shape serves both the Dietas and Treinos tabs.                             */
/* -------------------------------------------------------------------------- */

export type AdminTemplateOrigin = "system" | "clinic";

export const ADMIN_TEMPLATE_ORIGIN_LABELS: Record<AdminTemplateOrigin, string> = {
  system: "Sistema",
  clinic: "Clínica",
};

/** Query for the admin's cross-clinic diet/workout listing. */
export const adminTemplateListQuerySchema = z.object({
  clinic: z.string().uuid().optional(),
  origin: z.enum(["system", "clinic"]).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type AdminTemplateListQuery = z.output<typeof adminTemplateListQuerySchema>;

export type AdminTemplateListItemDto = {
  id: string;
  name: string;
  clinicId: string;
  clinicName: string;
  origin: AdminTemplateOrigin;
  sourceKey: string | null;
  archived: boolean;
  updatedAt: string;
  studentUsageCount: number;
};

export type AdminTemplateListResponse = {
  items: AdminTemplateListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** A system diet/workout starter offered in the "Importar starters" dialog. */
export type AdminTemplateStarterDto = { key: string; name: string };


/* -------------------------------------------------------------------------- */
/*  Per-clinic capability limits (admin clinic detail)                         */
/* -------------------------------------------------------------------------- */

/**
 * A clinic's effective limits, as the admin clinic-detail "Limites" card reads
 * them: the plan defaults plus this clinic's overrides. Each override is `null`
 * when the clinic inherits the plan; a value wins for this clinic only.
 */
export type AdminClinicLimitsDto = {
  plan: string;
  planName: string;
  planMaxStudents: number | null;
  planMaxCoaches: number | null;
  planWhatsapp: boolean;
  maxStudentsOverride: number | null;
  maxCoachesOverride: number | null;
  whatsappOverride: boolean | null;
};

/**
 * Admin edit of a clinic's overrides. Each field is nullable: `null` = inherit
 * the plan. A present cap must be a non-negative integer; `whatsappOverride`
 * true/false forces the channel on/off for this clinic.
 */
export const clinicLimitsUpdateSchema = z.object({
  maxStudentsOverride: z
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .nullable(),
  maxCoachesOverride: z
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .nullable(),
  whatsappOverride: z.boolean().nullable(),
});
export type ClinicLimitsUpdateInput = z.output<typeof clinicLimitsUpdateSchema>;
