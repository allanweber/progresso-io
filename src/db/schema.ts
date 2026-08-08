import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { DietTree } from "@/lib/student-diets";

/**
 * Application roles.
 *
 * - `coach`  — the platform's primary user; created on every self-service sign-up.
 * - `aluno`  — a coach's student; provisioned inside a clinic (see {@link students}).
 * - `admin`  — Progresso IO super admin; full platform access (Better Auth admin plugin).
 *
 * Stored on {@link user}.`role` as plain text so it stays compatible with the
 * Better Auth admin plugin, which reads/writes the column as a string.
 */
export const ROLES = ["coach", "aluno", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Subscription plans. The clinic is the billing unit.
 */
export const PLANS = ["free", "solo", "clinica", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/**
 * Lifecycle of a student within a clinic.
 *
 * - `active`   — a current student (the default on creation).
 * - `inactive` — paused/dormant, but kept for history.
 * - `archived` — soft-removed; hidden from the default roster, never deleted so
 *   past treinos/dietas stay intact. Deletion is never destructive here.
 */
export const STUDENT_STATUSES = ["active", "inactive", "archived"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/**
 * How the coach works with a student.
 *
 * - `online`    — trains through the portal (treinos/dietas in the app).
 * - `in_person` — presencial; the coach still keeps a record and can message
 *   them, but the student may never log in.
 */
export const MODALITIES = ["online", "in_person"] as const;
export type Modality = (typeof MODALITIES)[number];

/**
 * Whether a catalog entry is a single food/ingredient or a composite dish.
 * Derived at seed time from the TACO description (see the catalog transformer).
 */
export const FOOD_TYPES = ["ingrediente", "preparacao"] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

/**
 * Coarse grouping of a nutrient, used only to order/section the nutrient list
 * in the food detail view.
 */
export const NUTRIENT_KINDS = [
  "energy",
  "macro",
  "mineral",
  "vitamin",
  "fatty_acid",
  "amino_acid",
  "other",
] as const;
export type NutrientKind = (typeof NUTRIENT_KINDS)[number];

/* -------------------------------------------------------------------------- */
/*  Exercise catalog enums                                                    */
/*                                                                            */
/*  Stable snake_case slugs from the free-exercise-db source (see the         */
/*  exercise transformer). The PT-BR labels for each live in                  */
/*  src/lib/exercises.ts, like the food catalog's nutrient labels.            */
/* -------------------------------------------------------------------------- */

/** Broad training category of an exercise. */
export const EXERCISE_CATEGORIES = [
  "strength",
  "stretching",
  "plyometrics",
  "strongman",
  "powerlifting",
  "cardio",
  "olympic_weightlifting",
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/** Difficulty level. */
export const EXERCISE_LEVELS = ["beginner", "intermediate", "expert"] as const;
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];

/** Force vector of the movement (nullable in the source). */
export const EXERCISE_FORCES = ["pull", "push", "static"] as const;
export type ExerciseForce = (typeof EXERCISE_FORCES)[number];

/** Whether the movement is compound or an isolation (nullable in the source). */
export const EXERCISE_MECHANICS = ["compound", "isolation"] as const;
export type ExerciseMechanic = (typeof EXERCISE_MECHANICS)[number];

/** Equipment needed (nullable in the source — some exercises list none). */
export const EXERCISE_EQUIPMENT = [
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
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];

/** The muscle groups an exercise can target (primary or secondary). */
export const MUSCLES = [
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
export type Muscle = (typeof MUSCLES)[number];

/* -------------------------------------------------------------------------- */
/*  Better Auth core tables                                                   */
/*  Field names are camelCase (what Better Auth reads); the Drizzle client is */
/*  configured with `casing: "snake_case"`, so columns are snake_case in PG.  */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // Better Auth admin plugin fields.
  role: text("role").$type<Role>().default("coach").notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // Tenant the user belongs to. Null only for platform admins (no clinic).
  // Set right after sign-up (see the clinic bootstrap in lib/auth).
  // `AnyPgColumn` breaks the user<->clinic circular-reference type inference.
  clinicId: uuid("clinic_id").references((): AnyPgColumn => clinic.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Better Auth admin plugin: set when an admin is impersonating this session.
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  // Hashed password for the email/password provider.
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Tenant                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The tenant. Every coach and aluno belongs to exactly one clinic — a solo
 * coach still owns a clinic (a one-member clinic). The `Clínica` plan allows
 * multiple coaches to share one clinic. `clinicId` is THE tenant key: every
 * domain query is scoped by it (enforced through the Data Access Layer).
 */
export const clinic = pgTable("clinic", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").$type<Plan>().default("free").notNull(),
  // The coach who created the clinic. Not cascaded, so removing an owner never
  // silently drops a whole clinic's data.
  ownerUserId: text("owner_user_id")
    .notNull()
    .references((): AnyPgColumn => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Domain tables (all tenant-scoped by clinicId)                             */
/* -------------------------------------------------------------------------- */

/**
 * A student (aluno) within a clinic. Belongs to the clinic (the tenant) and is
 * optionally assigned to a specific coach. `userId` links to the aluno's own
 * login once they accept an invite; null while only provisioned. An e-mail is
 * always required (for communication) even when the student never logs in.
 */
export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // Coach assigned to this student (within the same clinic). Optional.
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // The aluno's own login, once they accept an invite and set a password.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    goal: text("goal"),
    status: text("status").$type<StudentStatus>().default("active").notNull(),
    modality: text("modality").$type<Modality>().default("online").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.clinicId, table.email)],
);

/**
 * Per-plan cap on the number of students a clinic may hold. Reference data
 * (not tenant-scoped), keyed by the lowercase plan name so limits are edited in
 * the database rather than hardcoded. `maxStudents = null` means unlimited.
 */
export const planLimit = pgTable("plan_limit", {
  plan: text("plan").$type<Plan>().primaryKey(),
  maxStudents: integer("max_students"),
});

/**
 * A pending invite for a student to activate their aluno login. The raw token
 * lives only in the e-mailed link; we store its SHA-256 hash. Single active
 * invite per student is enforced in the DAL (previous ones are superseded).
 */
export const invitation = pgTable("invitation", {
  id: uuid("id").defaultRandom().primaryKey(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinic.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  // SHA-256 of the raw token. The raw token is never persisted.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* -------------------------------------------------------------------------- */
/*  Food catalog (reference data — mostly NOT tenant-scoped, like plan_limit)  */
/*                                                                            */
/*  The base catalog is the Brazilian food composition table (TACO, NEPA/       */
/*  UNICAMP), shared by every clinic. A `food`/`food_substitution` row with     */
/*  `clinic_id = NULL` is that shared base; a row with `clinic_id` set is a     */
/*  single clinic's own custom entry. The DAL reads                            */
/*  `clinic_id IS NULL OR clinic_id = ctx.clinicId`                            */
/*  and only writes custom rows with `ctx.clinicId`, so the tenancy rule still */
/*  holds even though the base rows are global.                               */
/* -------------------------------------------------------------------------- */

/** Canonical food groups — the normalized TACO "categoria" values. */
export const foodGroup = pgTable("food_group", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

/**
 * Canonical nutrient dimension (~40 rows). The unit is fixed per nutrient
 * (e.g. energy is split into `energy_kcal`/`energy_kj`), so `food_nutrient`
 * only stores the value.
 */
export const nutrient = pgTable("nutrient", {
  id: text("id").primaryKey(), // slug, e.g. "protein", "energy_kcal", "calcium"
  label: text("label").notNull(), // PT-BR label, e.g. "Proteína"
  unit: text("unit").notNull(), // "g" | "mg" | "mcg" | "kcal" | "kJ"
  kind: text("kind").$type<NutrientKind>().notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/**
 * One row per food, values per 100 g. The six "hot" macros are denormalized
 * from {@link foodNutrient} so the listing can sort/filter without a join; the
 * full nutrient profile lives in {@link foodNutrient}. `clinic_id = NULL` is the
 * shared TACO base; a set `clinic_id` is a clinic's own custom food.
 */
export const food = pgTable(
  "food",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // TACO food number ("42"). NULL for clinic-custom foods; unique when present.
    code: text("code").unique(),
    description: text("description").notNull(),
    // unaccent(lower(description)); the trigram search index is built on this.
    searchText: text("search_text").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => foodGroup.id),
    type: text("type").$type<FoodType>().notNull(),
    source: text("source").notNull().default("TACO"),
    // NULL = shared TACO base; set = this clinic's private custom food.
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    // Denormalized macros per 100 g (nullable: TACO has unmeasured cells).
    energyKcal: doublePrecision("energy_kcal"),
    protein: doublePrecision("protein"),
    carbohydrate: doublePrecision("carbohydrate"),
    fat: doublePrecision("fat"),
    fiber: doublePrecision("fiber"),
    sodium: doublePrecision("sodium"),
    // Soft-delete: archived foods drop out of listings but keep references.
    archived: boolean("archived").default(false).notNull(),
    // Flags the ~24 base entries with a duplicate description, for later review.
    needsReview: boolean("needs_review").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("food_group_idx").on(t.groupId),
    index("food_type_idx").on(t.type),
    index("food_clinic_idx").on(t.clinicId),
    // The GIN trigram index on `search_text` is added by hand in the migration
    // (it needs the pg_trgm operator class / the extension created first).
  ],
);

/**
 * Full nutrient profile of a food (per 100 g). An absent nutrient has no row
 * (read as null). `value = NULL` means the TACO cell was unmeasured (empty)
 * or a trace; `is_trace` distinguishes a measured trace (`Tr`) from unmeasured.
 */
export const foodNutrient = pgTable(
  "food_nutrient",
  {
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "cascade" }),
    nutrientId: text("nutrient_id")
      .notNull()
      .references(() => nutrient.id),
    value: doublePrecision("value"),
    isTrace: boolean("is_trace").default(false).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.nutrientId] }),
    index("food_nutrient_nutrient_idx").on(t.nutrientId),
  ],
);

/**
 * A directed substitution edge: `grams` of `substitute_food` replace 100 g of
 * `food`. `clinic_id = NULL` is a base substitution (seed / super admin);
 * a set `clinic_id` is a clinic's own rule (created by a coach).
 */
export const foodSubstitution = pgTable(
  "food_substitution",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "cascade" }),
    substituteFoodId: uuid("substitute_food_id")
      .notNull()
      .references(() => food.id, { onDelete: "cascade" }),
    // Grams of the substitute equivalent to 100 g of the main food.
    grams: doublePrecision("grams").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("food_sub_lookup_idx").on(t.clinicId, t.foodId),
    check("food_sub_grams_positive", sql`${t.grams} > 0`),
    check("food_sub_not_self", sql`${t.foodId} <> ${t.substituteFoodId}`),
  ],
);

/**
 * A named household measure for a food (medida caseira): `grams` of the food
 * equal one `label` (e.g. "unidade" = 50 g, "fatia" = 25 g). Same base/custom
 * shape as `food_substitution`: `clinic_id = NULL` is a shared base measure
 * (seed / super admin), a set `clinic_id` is a clinic's own. A clinic sees
 * `clinic_id IS NULL OR clinic_id = ctx.clinicId`. Lets a diet item be entered
 * as "2 unidades" and converted to grams (macros stay per 100 g).
 */
export const foodMeasure = pgTable(
  "food_measure",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "cascade" }),
    // Free-text portion name (PT-BR), e.g. "unidade", "fatia", "colher de sopa".
    label: text("label").notNull(),
    // Grams equivalent to one of this measure.
    grams: doublePrecision("grams").notNull(),
    // Suggested as the pre-selected unit for the food (a hint, not enforced).
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("food_measure_lookup_idx").on(t.clinicId, t.foodId),
    check("food_measure_grams_positive", sql`${t.grams} > 0`),
  ],
);

/**
 * A clinic's favorited foods. Unlike the rest of the catalog, a favorite is
 * always tenant-scoped: `clinic_id` is required (there is no shared/base
 * favorite). A clinic may favorite any food it can see — a base TACO food or
 * one of its own custom foods. One row per `(clinic, food)` pair.
 */
export const foodFavorite = pgTable(
  "food_favorite",
  {
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clinicId, t.foodId] }),
    index("food_favorite_food_idx").on(t.foodId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Exercise catalog (reference data — same base/custom shape as the food      */
/*  catalog)                                                                   */
/*                                                                            */
/*  The base catalog is the open free-exercise-db dataset (English enums, with */
/*  PT-BR name/instructions from the exercicios-bd-ptbr translation), shared   */
/*  by every clinic as rows with `clinic_id = NULL`. A row with `clinic_id`    */
/*  set is a single clinic's own custom exercise (a later phase). The DAL reads */
/*  `clinic_id IS NULL OR clinic_id = ctx.clinicId` and only writes custom      */
/*  rows, so the tenancy rule holds even though base rows are global. Muscles,  */
/*  instructions and image keys are stored as text arrays; the images          */
/*  themselves are served from object storage (see src/lib/exercises.ts).      */
/* -------------------------------------------------------------------------- */

export const exercise = pgTable(
  "exercise",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Source slug ("3_4_Sit-Up"), also the image folder. NULL for custom
    // exercises; unique when present.
    code: text("code").unique(),
    name: text("name").notNull(),
    // Free-text summary (PT-BR). NULL for the seeded base catalog (which has no
    // description); set by coaches/admin when they register a custom exercise.
    description: text("description"),
    // unaccent(lower(name)); the trigram search index is built on this.
    searchText: text("search_text").notNull(),
    category: text("category").$type<ExerciseCategory>().notNull(),
    level: text("level").$type<ExerciseLevel>().notNull(),
    // Nullable in the source (some exercises leave these blank).
    force: text("force").$type<ExerciseForce>(),
    mechanic: text("mechanic").$type<ExerciseMechanic>(),
    equipment: text("equipment").$type<ExerciseEquipment>(),
    primaryMuscles: text("primary_muscles")
      .array()
      .$type<Muscle[]>()
      .notNull()
      .default([]),
    secondaryMuscles: text("secondary_muscles")
      .array()
      .$type<Muscle[]>()
      .notNull()
      .default([]),
    // Ordered step-by-step instructions (PT-BR).
    instructions: text("instructions").array().notNull().default([]),
    // Relative image keys ("<code>/0.jpg"); resolved to a URL at render time.
    images: text("images").array().notNull().default([]),
    source: text("source").notNull().default("free-exercise-db"),
    // NULL = shared base; set = this clinic's private custom exercise.
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    // Soft-delete: archived exercises drop out of listings but keep references.
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("exercise_category_idx").on(t.category),
    index("exercise_clinic_idx").on(t.clinicId),
    // The GIN trigram index on `search_text` is added by hand in the migration
    // (it needs the pg_trgm operator class / the extension, created earlier).
  ],
);

/**
 * A substitution edge between two exercises: `substitute_exercise` can replace
 * `exercise` (same muscle/movement, seeded to favor common gym equipment).
 * Unlike food substitutions there is no `grams` — an exercise swap is a plain
 * link. `clinic_id = NULL` is a base substitution (seed / super admin); a set
 * `clinic_id` is a clinic's own rule.
 */
export const exerciseSubstitution = pgTable(
  "exercise_substitution",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    substituteExerciseId: uuid("substitute_exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("exercise_sub_lookup_idx").on(t.clinicId, t.exerciseId),
    check(
      "exercise_sub_not_self",
      sql`${t.exerciseId} <> ${t.substituteExerciseId}`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Diets (coach-authored meal plans — same base/custom shape as the catalog)  */
/*                                                                            */
/*  A diet is a generic, reusable meal-plan template. `clinic_id = NULL` is a   */
/*  shared base/template diet (reserved for a future platform/admin catalog —   */
/*  not created in this phase); a set `clinic_id` is a clinic's own diet,        */
/*  authored by a coach. The DAL reads                                          */
/*  `clinic_id IS NULL OR clinic_id = ctx.clinicId` and only writes clinic-owned */
/*  rows (stamping `ctx.clinicId`), so the tenancy rule holds. Assigning a diet  */
/*  to a student (with versioned history) is a later phase and will snapshot,    */
/*  so there is deliberately no student link here.                              */
/*                                                                            */
/*  Nutrition (kcal/macros) is NOT stored: totals are computed at read time      */
/*  from the referenced `food` rows (a live reference, per 100 g × grams/100).   */
/*  The child tables inherit tenancy through their FK to `diet` (the DAL scopes  */
/*  by the parent diet), so they carry no `clinic_id` of their own.             */
/* -------------------------------------------------------------------------- */

export const diet = pgTable(
  "diet",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // NULL = shared base/template diet; set = this clinic's own diet.
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    // The coach who authored the diet. NULL for base diets (no author); set to
    // the creating coach for a clinic's own diet.
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    // Free-text notes/observations (PT-BR), optional.
    notes: text("notes"),
    // Soft-delete: archived diets drop out of listings but keep their rows.
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("diet_clinic_idx").on(t.clinicId)],
);

/** A meal within a diet (e.g. "Café da manhã"), ordered by `position`. */
export const dietMeal = pgTable(
  "diet_meal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dietId: uuid("diet_id")
      .notNull()
      .references(() => diet.id, { onDelete: "cascade" }),
    // Free-text label (PT-BR), e.g. "Café da manhã", "Almoço".
    name: text("name").notNull(),
    // Optional time-of-day label, e.g. "08:00". Free text (not validated as a
    // real time) so the coach can write "ao acordar" etc.
    time: text("time"),
    // Ordering within the diet (0-based).
    position: integer("position").notNull().default(0),
  },
  (t) => [index("diet_meal_diet_idx").on(t.dietId)],
);

/** A food line within a meal: `grams` of `food`, ordered by `position`. */
export const dietMealItem = pgTable(
  "diet_meal_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dietMealId: uuid("diet_meal_id")
      .notNull()
      .references(() => dietMeal.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "restrict" }),
    grams: doublePrecision("grams").notNull(),
    // How the quantity was entered (medida caseira): a snapshot of the measure
    // label and its grams-per-unit, for display and re-editing. NULL = plain
    // grams. `grams` stays the canonical amount (= count × measureGrams).
    measureLabel: text("measure_label"),
    measureGrams: doublePrecision("measure_grams"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("diet_meal_item_meal_idx").on(t.dietMealId),
    index("diet_meal_item_food_idx").on(t.foodId),
    check("diet_meal_item_grams_positive", sql`${t.grams} > 0`),
  ],
);

/**
 * An equivalence/substitute a coach offers for a meal item: `grams` of `food`
 * may replace the item's own food. Independent of the catalog's
 * `food_substitution` rules (those only pre-suggest options in the UI).
 */
export const dietMealItemSubstitute = pgTable(
  "diet_meal_item_substitute",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dietMealItemId: uuid("diet_meal_item_id")
      .notNull()
      .references(() => dietMealItem.id, { onDelete: "cascade" }),
    foodId: uuid("food_id")
      .notNull()
      .references(() => food.id, { onDelete: "restrict" }),
    grams: doublePrecision("grams").notNull(),
    // Measure snapshot for display/edit (see diet_meal_item). NULL = grams.
    measureLabel: text("measure_label"),
    measureGrams: doublePrecision("measure_grams"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("diet_item_sub_item_idx").on(t.dietMealItemId),
    index("diet_item_sub_food_idx").on(t.foodId),
    check("diet_item_sub_grams_positive", sql`${t.grams} > 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Student diets (dieta do aluno — versioned, snapshotted meal plans)         */
/*                                                                            */
/*  A student's diet is distinct from the reusable template `diet`: it belongs */
/*  to ONE student, is **versioned** (1..N), and each version stores its whole  */
/*  meal tree as a self-contained JSON snapshot (food description + macros      */
/*  embedded), so a published version never changes when a base food is later   */
/*  edited. A coach builds a draft (not visible to the aluno) and **publishes**  */
/*  it to make it available; each publish numbers a new immutable version.      */
/*                                                                            */
/*  A student accumulates a history of diets, but only one is `active` at a     */
/*  time. Creating a new diet starts a fresh version chain; on its first        */
/*  publish the previously-active diet is archived. Tenancy is by `clinic_id`    */
/*  (+ `student_id`); versions inherit it through their FK to `student_diet`.   */
/* -------------------------------------------------------------------------- */

/**
 * Lifecycle of a student's diet (the named plan container).
 *
 * - `draft`    — a brand-new diet being built; it has no published version yet,
 *   so the aluno still sees the previous active diet until this one is published.
 * - `active`   — the current diet (has ≥ 1 published version). At most one per
 *   student.
 * - `archived` — a superseded diet kept in history (never destructive).
 */
export const STUDENT_DIET_STATUSES = ["draft", "active", "archived"] as const;
export type StudentDietStatus = (typeof STUDENT_DIET_STATUSES)[number];

/** A version is a `draft` (unpublished, editable) or an immutable `published`. */
export const STUDENT_DIET_VERSION_STATUSES = ["draft", "published"] as const;
export type StudentDietVersionStatus =
  (typeof STUDENT_DIET_VERSION_STATUSES)[number];

export const studentDiet = pgTable(
  "student_diet",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Provenance: the template diet this was copied from (a loose reference). Set
    // null if that template is later deleted — the student's copy is independent.
    sourceDietId: uuid("source_diet_id").references(() => diet.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<StudentDietStatus>()
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_diet_clinic_idx").on(t.clinicId),
    index("student_diet_student_idx").on(t.studentId),
  ],
);

export const studentDietVersion = pgTable(
  "student_diet_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentDietId: uuid("student_diet_id")
      .notNull()
      .references(() => studentDiet.id, { onDelete: "cascade" }),
    // Assigned on publish (1, 2, 3…); NULL while a draft. At most one draft
    // (version = NULL) per diet, enforced in the DAL.
    version: integer("version"),
    status: text("status")
      .$type<StudentDietVersionStatus>()
      .default("draft")
      .notNull(),
    // The whole meal tree, self-contained (food + macros embedded). Built on the
    // server from the catalog; a published tree is frozen and never recomputed.
    tree: jsonb("tree").$type<DietTree>().notNull(),
    notes: text("notes"),
    publishedAt: timestamp("published_at"),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_diet_version_diet_idx").on(t.studentDietId),
    // Published version numbers are unique within a diet (NULLs — drafts — are
    // distinct in Postgres, so this never blocks a draft).
    unique("student_diet_version_number_uq").on(t.studentDietId, t.version),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Relations                                                                 */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  clinic: one(clinic, {
    fields: [user.clinicId],
    references: [clinic.id],
    relationName: "clinicMembers",
  }),
  ownedClinics: many(clinic, { relationName: "clinicOwner" }),
  // Students this user coaches.
  coachedStudents: many(students, { relationName: "studentCoach" }),
}));

export const clinicRelations = relations(clinic, ({ one, many }) => ({
  owner: one(user, {
    fields: [clinic.ownerUserId],
    references: [user.id],
    relationName: "clinicOwner",
  }),
  members: many(user, { relationName: "clinicMembers" }),
  students: many(students),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  clinic: one(clinic, {
    fields: [students.clinicId],
    references: [clinic.id],
  }),
  coach: one(user, {
    fields: [students.coachId],
    references: [user.id],
    relationName: "studentCoach",
  }),
  account: one(user, {
    fields: [students.userId],
    references: [user.id],
  }),
  invitations: many(invitation),
  diets: many(studentDiet),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  clinic: one(clinic, {
    fields: [invitation.clinicId],
    references: [clinic.id],
  }),
  student: one(students, {
    fields: [invitation.studentId],
    references: [students.id],
  }),
}));

export const foodGroupRelations = relations(foodGroup, ({ many }) => ({
  foods: many(food),
}));

export const nutrientRelations = relations(nutrient, ({ many }) => ({
  values: many(foodNutrient),
}));

export const foodRelations = relations(food, ({ one, many }) => ({
  group: one(foodGroup, {
    fields: [food.groupId],
    references: [foodGroup.id],
  }),
  clinic: one(clinic, {
    fields: [food.clinicId],
    references: [clinic.id],
  }),
  nutrients: many(foodNutrient),
  // Substitutions where this food is the main food.
  substitutions: many(foodSubstitution, { relationName: "substitutionMain" }),
  // Substitutions where this food is offered as the substitute.
  substituteFor: many(foodSubstitution, {
    relationName: "substitutionSubstitute",
  }),
  favoritedBy: many(foodFavorite),
}));

export const foodNutrientRelations = relations(foodNutrient, ({ one }) => ({
  food: one(food, {
    fields: [foodNutrient.foodId],
    references: [food.id],
  }),
  nutrient: one(nutrient, {
    fields: [foodNutrient.nutrientId],
    references: [nutrient.id],
  }),
}));

export const foodSubstitutionRelations = relations(
  foodSubstitution,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [foodSubstitution.clinicId],
      references: [clinic.id],
    }),
    food: one(food, {
      fields: [foodSubstitution.foodId],
      references: [food.id],
      relationName: "substitutionMain",
    }),
    substitute: one(food, {
      fields: [foodSubstitution.substituteFoodId],
      references: [food.id],
      relationName: "substitutionSubstitute",
    }),
  }),
);

export const foodMeasureRelations = relations(foodMeasure, ({ one }) => ({
  clinic: one(clinic, {
    fields: [foodMeasure.clinicId],
    references: [clinic.id],
  }),
  food: one(food, {
    fields: [foodMeasure.foodId],
    references: [food.id],
  }),
}));

export const foodFavoriteRelations = relations(foodFavorite, ({ one }) => ({
  clinic: one(clinic, {
    fields: [foodFavorite.clinicId],
    references: [clinic.id],
  }),
  food: one(food, {
    fields: [foodFavorite.foodId],
    references: [food.id],
  }),
}));

export const exerciseRelations = relations(exercise, ({ one, many }) => ({
  clinic: one(clinic, {
    fields: [exercise.clinicId],
    references: [clinic.id],
  }),
  // Substitutions where this exercise is the main one.
  substitutions: many(exerciseSubstitution, {
    relationName: "exerciseSubstitutionMain",
  }),
  // Substitutions where this exercise is offered as the substitute.
  substituteFor: many(exerciseSubstitution, {
    relationName: "exerciseSubstitutionSubstitute",
  }),
}));

export const exerciseSubstitutionRelations = relations(
  exerciseSubstitution,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [exerciseSubstitution.clinicId],
      references: [clinic.id],
    }),
    exercise: one(exercise, {
      fields: [exerciseSubstitution.exerciseId],
      references: [exercise.id],
      relationName: "exerciseSubstitutionMain",
    }),
    substitute: one(exercise, {
      fields: [exerciseSubstitution.substituteExerciseId],
      references: [exercise.id],
      relationName: "exerciseSubstitutionSubstitute",
    }),
  }),
);

export const dietRelations = relations(diet, ({ one, many }) => ({
  clinic: one(clinic, {
    fields: [diet.clinicId],
    references: [clinic.id],
  }),
  coach: one(user, {
    fields: [diet.coachId],
    references: [user.id],
  }),
  meals: many(dietMeal),
}));

export const dietMealRelations = relations(dietMeal, ({ one, many }) => ({
  diet: one(diet, {
    fields: [dietMeal.dietId],
    references: [diet.id],
  }),
  items: many(dietMealItem),
}));

export const dietMealItemRelations = relations(
  dietMealItem,
  ({ one, many }) => ({
    meal: one(dietMeal, {
      fields: [dietMealItem.dietMealId],
      references: [dietMeal.id],
    }),
    food: one(food, {
      fields: [dietMealItem.foodId],
      references: [food.id],
    }),
    substitutes: many(dietMealItemSubstitute),
  }),
);

export const dietMealItemSubstituteRelations = relations(
  dietMealItemSubstitute,
  ({ one }) => ({
    item: one(dietMealItem, {
      fields: [dietMealItemSubstitute.dietMealItemId],
      references: [dietMealItem.id],
    }),
    food: one(food, {
      fields: [dietMealItemSubstitute.foodId],
      references: [food.id],
    }),
  }),
);

export const studentDietRelations = relations(
  studentDiet,
  ({ one, many }) => ({
    clinic: one(clinic, {
      fields: [studentDiet.clinicId],
      references: [clinic.id],
    }),
    student: one(students, {
      fields: [studentDiet.studentId],
      references: [students.id],
    }),
    sourceDiet: one(diet, {
      fields: [studentDiet.sourceDietId],
      references: [diet.id],
    }),
    versions: many(studentDietVersion),
  }),
);

export const studentDietVersionRelations = relations(
  studentDietVersion,
  ({ one }) => ({
    diet: one(studentDiet, {
      fields: [studentDietVersion.studentDietId],
      references: [studentDiet.id],
    }),
    publisher: one(user, {
      fields: [studentDietVersion.publishedBy],
      references: [user.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Clinic = typeof clinic.$inferSelect;
export type NewClinic = typeof clinic.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type PlanLimit = typeof planLimit.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
export type FoodGroup = typeof foodGroup.$inferSelect;
export type NewFoodGroup = typeof foodGroup.$inferInsert;
export type Nutrient = typeof nutrient.$inferSelect;
export type NewNutrient = typeof nutrient.$inferInsert;
export type Food = typeof food.$inferSelect;
export type NewFood = typeof food.$inferInsert;
export type FoodNutrient = typeof foodNutrient.$inferSelect;
export type NewFoodNutrient = typeof foodNutrient.$inferInsert;
export type FoodSubstitution = typeof foodSubstitution.$inferSelect;
export type NewFoodSubstitution = typeof foodSubstitution.$inferInsert;
export type FoodFavorite = typeof foodFavorite.$inferSelect;
export type NewFoodFavorite = typeof foodFavorite.$inferInsert;
export type FoodMeasure = typeof foodMeasure.$inferSelect;
export type NewFoodMeasure = typeof foodMeasure.$inferInsert;
export type Exercise = typeof exercise.$inferSelect;
export type NewExercise = typeof exercise.$inferInsert;
export type ExerciseSubstitution = typeof exerciseSubstitution.$inferSelect;
export type NewExerciseSubstitution = typeof exerciseSubstitution.$inferInsert;
export type Diet = typeof diet.$inferSelect;
export type NewDiet = typeof diet.$inferInsert;
export type DietMeal = typeof dietMeal.$inferSelect;
export type NewDietMeal = typeof dietMeal.$inferInsert;
export type DietMealItem = typeof dietMealItem.$inferSelect;
export type NewDietMealItem = typeof dietMealItem.$inferInsert;
export type DietMealItemSubstitute = typeof dietMealItemSubstitute.$inferSelect;
export type NewDietMealItemSubstitute =
  typeof dietMealItemSubstitute.$inferInsert;
export type StudentDiet = typeof studentDiet.$inferSelect;
export type NewStudentDiet = typeof studentDiet.$inferInsert;
export type StudentDietVersion = typeof studentDietVersion.$inferSelect;
export type NewStudentDietVersion = typeof studentDietVersion.$inferInsert;
