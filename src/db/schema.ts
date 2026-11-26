import { relations, sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  ANAMNESIS_MODALITY_VALUES,
  ANAMNESIS_OBJECTIVE_VALUES,
  type AnamnesisModality,
  type AnamnesisObjective,
  type AnamnesisSection,
} from "@/lib/anamneses";
import {
  ANAMNESIS_FILLED_BY_VALUES,
  STUDENT_ANAMNESIS_STATUS_VALUES,
  type AnamnesisAnswers,
  type AnamnesisFilledBy,
  type StudentAnamnesisStatus,
} from "@/lib/student-anamneses";
import {
  ASSESSMENT_PRESETS,
  BODY_FAT_SOURCES,
  type AssessmentPreset,
  type BodyFatSource,
  type CheckinCircumferences,
  type CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import type { AiEvaluationPayload } from "@/lib/ai-evaluation";
import {
  BODY_MAP_MUSCLES,
  EXERCISE_BODY_PARTS,
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_MACHINE_KINDS,
  EXERCISE_NEEDS,
  EXERCISE_SECONDARY_MUSCLES,
  EXERCISE_TARGETS,
  EXERCISE_TRACKS,
  type BodyMapMuscle,
  type ExerciseBodyPart,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseMachineKind,
  type ExerciseNeed,
  type ExerciseSecondaryMuscle,
  type ExerciseTarget,
  type ExerciseTrack,
} from "@/lib/exercises";
import {
  NOTIFICATION_TYPES,
  type NotificationData,
  type NotificationType,
} from "@/lib/notifications";
import type { DietStructure } from "@/lib/student-diets";
import {
  WHATSAPP_CONNECTION_STATUSES,
  WHATSAPP_MESSAGE_DIRECTIONS,
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_MESSAGE_TYPES,
  WHATSAPP_TEMPLATE_STATUSES,
  type WhatsAppConnectionStatus,
  type WhatsAppMessageDirection,
  type WhatsAppMessageStatus,
  type WhatsAppMessageType,
  type WhatsAppTemplateStatus,
} from "@/lib/whatsapp-inbox";
import type { WorkoutStructure } from "@/lib/student-workouts";
import type { WorkoutReps } from "@/lib/workouts";
import {
  WORKOUT_TECHNIQUES,
  type WorkoutTechnique,
} from "@/lib/workout-techniques";

export type { AssessmentPreset, BodyFatSource } from "@/lib/checkin-assessment";

export const ROLES = ["coach", "aluno", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PLANS = ["free", "solo", "clinica", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const AI_GENERATION_KINDS = ["workout", "diet", "evaluation"] as const;
export type AiGenerationKind = (typeof AI_GENERATION_KINDS)[number];

export const AI_GENERATION_STATUSES = ["pending", "succeeded", "failed"] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

export const FEEDBACK_FREQUENCIES = ["semanal", "quinzenal", "mensal"] as const;
export type FeedbackFrequency = (typeof FEEDBACK_FREQUENCIES)[number];

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const STUDENT_STATUSES = ["active", "inactive", "archived"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const MODALITIES = ["online", "in_person"] as const;
export type Modality = (typeof MODALITIES)[number];

export const SEXES = ["masculino", "feminino"] as const;
export type Sex = (typeof SEXES)[number];

export const FOOD_TYPES = ["ingrediente", "preparacao"] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

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

export type {
  BodyMapMuscle,
  ExerciseBodyPart,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseMachineKind,
  ExerciseNeed,
  ExerciseSecondaryMuscle,
  ExerciseTarget,
  ExerciseTrack,
} from "@/lib/exercises";

export const INVOICE_STATUSES = ["pending", "paid", "canceled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "pix",
  "boleto",
  "cartao",
  "transferencia",
  "outro",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const INVOICE_REMINDER_CHANNELS = ["whatsapp", "email"] as const;
export type InvoiceReminderChannel = (typeof INVOICE_REMINDER_CHANNELS)[number];

export const STUDENT_DIET_STATUSES = ["draft", "active", "archived"] as const;
export type StudentDietStatus = (typeof STUDENT_DIET_STATUSES)[number];

export const STUDENT_DIET_VERSION_STATUSES = ["draft", "published"] as const;
export type StudentDietVersionStatus =
  (typeof STUDENT_DIET_VERSION_STATUSES)[number];

export const STUDENT_WORKOUT_STATUSES = ["draft", "active", "archived"] as const;
export type StudentWorkoutStatus = (typeof STUDENT_WORKOUT_STATUSES)[number];

export const STUDENT_WORKOUT_VERSION_STATUSES = ["draft", "published"] as const;
export type StudentWorkoutVersionStatus =
  (typeof STUDENT_WORKOUT_VERSION_STATUSES)[number];

export const CHECKIN_AUTHORS = ["student", "coach"] as const;
export type CheckinAuthor = (typeof CHECKIN_AUTHORS)[number];

export const CHECKIN_POSES = [
  "frente",
  "costas",
  "lado_esquerdo",
  "lado_direito",
] as const;
export type CheckinPose = (typeof CHECKIN_POSES)[number];

export const EVALUATION_STATUSES = ["pending", "accepted", "discarded"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_CONFIDENCES = ["baixa", "media", "alta"] as const;
export type EvaluationConfidence = (typeof EVALUATION_CONFIDENCES)[number];

export const EVALUATION_VERDICTS = ["manter", "ajustar", "reavaliar"] as const;
export type EvaluationVerdict = (typeof EVALUATION_VERDICTS)[number];

export const NOTE_SOURCES = ["manual", "ai_evaluation"] as const;
export type NoteSource = (typeof NOTE_SOURCES)[number];

export const NOTE_ACCEPTANCES = ["accepted", "accepted_edited"] as const;
export type NoteAcceptance = (typeof NOTE_ACCEPTANCES)[number];

export const CALENDAR_EVENT_TYPES = ["checkin", "presencial", "admin"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}

function allOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} <@ array[${sql.raw(list)}]::text[]`;
}

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: text("role").$type<Role>().default("coach").notNull(),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
    clinicId: uuid("clinic_id").references((): AnyPgColumn => clinic.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("user_clinic_idx").on(t.clinicId),
    check("user_role_check", oneOf(t.role, ROLES)),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
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
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const clinic = pgTable(
  "clinic",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    plan: text("plan").$type<Plan>().default("free").notNull(),
    intendedPlan: text("intended_plan").$type<Plan>(),
    trialEndsAt: timestamp("trial_ends_at"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references((): AnyPgColumn => user.id),
    portalSlug: text("portal_slug"),
    logoKey: text("logo_key"),
    headline: text("headline"),
    description: text("description"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    siteUrl: text("site_url"),
    accentColor: text("accent_color"),
    feedbackFrequency: text("feedback_frequency")
      .$type<FeedbackFrequency>()
      .default("semanal")
      .notNull(),
    feedbackPreferredDay: text("feedback_preferred_day")
      .$type<Weekday>()
      .default("monday")
      .notNull(),
    feedbackWhatsappReminder: boolean("feedback_whatsapp_reminder")
      .default(true)
      .notNull(),
    assessmentPreset: text("assessment_preset")
      .$type<AssessmentPreset>()
      .default("completa")
      .notNull(),
    maxStudentsOverride: integer("max_students_override"),
    maxCoachesOverride: integer("max_coaches_override"),
    whatsappOverride: boolean("whatsapp_override"),
    archiveOverride: boolean("archive_override"),
    calendarOverride: boolean("calendar_override"),
    aiGenerationsOverride: integer("ai_generations_override"),
    startersSeededAt: timestamp("starters_seeded_at"),
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("clinic_portal_slug_uq")
      .on(t.portalSlug)
      .where(sql`${t.portalSlug} is not null`),
    check("clinic_plan_check", oneOf(t.plan, PLANS)),
    check(
      "clinic_intended_plan_check",
      sql`${t.intendedPlan} is null or ${oneOf(t.intendedPlan, PLANS)}`,
    ),
    check(
      "clinic_feedback_frequency_check",
      oneOf(t.feedbackFrequency, FEEDBACK_FREQUENCIES),
    ),
    check(
      "clinic_feedback_preferred_day_check",
      oneOf(t.feedbackPreferredDay, WEEKDAYS),
    ),
    check(
      "clinic_assessment_preset_check",
      oneOf(t.assessmentPreset, ASSESSMENT_PRESETS),
    ),
  ],
);

export const student = pgTable(
  "student",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    goal: text("goal"),
    sex: text("sex").$type<Sex>(),
    birthDate: date("birth_date", { mode: "string" }),
    status: text("status").$type<StudentStatus>().default("active").notNull(),
    modality: text("modality").$type<Modality>().default("online").notNull(),
    ...timestamps,
  },
  (t) => [
    index("student_clinic_idx").on(t.clinicId),
    index("student_coach_idx").on(t.coachId),
    index("student_user_idx").on(t.userId),
    uniqueIndex("student_clinic_phone_uq")
      .on(t.clinicId, t.phone)
      .where(sql`${t.phone} is not null`),
    uniqueIndex("student_clinic_email_uq")
      .on(t.clinicId, t.email)
      .where(sql`${t.email} is not null`),
    check("student_sex_check", sql`${t.sex} is null or ${oneOf(t.sex, SEXES)}`),
    check("student_status_check", oneOf(t.status, STUDENT_STATUSES)),
    check("student_modality_check", oneOf(t.modality, MODALITIES)),
  ],
);

export const planLimit = pgTable(
  "plan_limit",
  {
    plan: text("plan").$type<Plan>().primaryKey(),
    maxStudents: integer("max_students"),
    maxCoaches: integer("max_coaches"),
    whatsapp: boolean("whatsapp").default(true).notNull(),
    archive: boolean("archive").default(true).notNull(),
    calendar: boolean("calendar").default(true).notNull(),
    aiGenerations: integer("ai_generations"),
  },
  (t) => [check("plan_limit_plan_check", oneOf(t.plan, PLANS))],
);

export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").$type<InvoiceStatus>().default("pending").notNull(),
    competencia: date("competencia").notNull(),
    issuedAt: date("issued_at").notNull(),
    dueDate: date("due_date").notNull(),
    paidAt: date("paid_at"),
    paymentMethod: text("payment_method").$type<PaymentMethod>(),
    discountCents: integer("discount_cents").default(0).notNull(),
    discountReason: text("discount_reason"),
    planSnapshot: text("plan_snapshot").$type<Plan>().notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("invoice_clinic_idx").on(t.clinicId),
    uniqueIndex("invoice_number_uq").on(t.number),
    check("invoice_status_check", oneOf(t.status, INVOICE_STATUSES)),
    check(
      "invoice_payment_method_check",
      sql`${t.paymentMethod} is null or ${oneOf(t.paymentMethod, PAYMENT_METHODS)}`,
    ),
    check("invoice_plan_snapshot_check", oneOf(t.planSnapshot, PLANS)),
    check("invoice_discount_non_negative", sql`${t.discountCents} >= 0`),
  ],
);

export const invoiceLineItem = pgTable(
  "invoice_line_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("invoice_line_item_invoice_idx").on(t.invoiceId)],
);

export const invoiceReminder = pgTable(
  "invoice_reminder",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    reminderDate: date("reminder_date").notNull(),
    channel: text("channel").$type<InvoiceReminderChannel>().notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("invoice_reminder_invoice_date_uq").on(
      t.invoiceId,
      t.reminderDate,
    ),
    check(
      "invoice_reminder_channel_check",
      oneOf(t.channel, INVOICE_REMINDER_CHANNELS),
    ),
  ],
);

export const clinicPlanChange = pgTable(
  "clinic_plan_change",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    fromPlan: text("from_plan").$type<Plan>(),
    toPlan: text("to_plan").$type<Plan>().notNull(),
    changedBy: text("changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("clinic_plan_change_clinic_idx").on(t.clinicId),
    check(
      "clinic_plan_change_from_check",
      sql`${t.fromPlan} is null or ${oneOf(t.fromPlan, PLANS)}`,
    ),
    check("clinic_plan_change_to_check", oneOf(t.toPlan, PLANS)),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("invitation_clinic_student_idx").on(t.clinicId, t.studentId)],
);

export const adminInvitation = pgTable(
  "admin_invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("admin_invitation_email_idx").on(t.email)],
);

export const coachInvitation = pgTable(
  "coach_invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("coach_invitation_clinic_idx").on(t.clinicId)],
);

export const foodGroup = pgTable("food_group", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

export const nutrient = pgTable(
  "nutrient",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    kind: text("kind").$type<NutrientKind>().notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [check("nutrient_kind_check", oneOf(t.kind, NUTRIENT_KINDS))],
);

export const food = pgTable(
  "food",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").unique(),
    description: text("description").notNull(),
    searchText: text("search_text").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => foodGroup.id),
    type: text("type").$type<FoodType>().notNull(),
    source: text("source").notNull(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    energyKcal: doublePrecision("energy_kcal"),
    protein: doublePrecision("protein"),
    carbohydrate: doublePrecision("carbohydrate"),
    fat: doublePrecision("fat"),
    fiber: doublePrecision("fiber"),
    sodium: doublePrecision("sodium"),
    archived: boolean("archived").default(false).notNull(),
    needsReview: boolean("needs_review").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("food_group_idx").on(t.groupId),
    index("food_type_idx").on(t.type),
    index("food_clinic_idx").on(t.clinicId),
    index("food_search_trgm").using("gin", sql`${t.searchText} gin_trgm_ops`),
    check("food_type_check", oneOf(t.type, FOOD_TYPES)),
  ],
);

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
    grams: doublePrecision("grams").notNull(),
    ...timestamps,
  },
  (t) => [
    index("food_sub_lookup_idx").on(t.clinicId, t.foodId),
    index("food_sub_substitute_idx").on(t.substituteFoodId),
    check("food_sub_grams_positive", sql`${t.grams} > 0`),
    check("food_sub_not_self", sql`${t.foodId} <> ${t.substituteFoodId}`),
  ],
);

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
    label: text("label").notNull(),
    grams: doublePrecision("grams").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("food_measure_lookup_idx").on(t.clinicId, t.foodId),
    index("food_measure_food_idx").on(t.foodId),
    check("food_measure_grams_positive", sql`${t.grams} > 0`),
  ],
);

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

export const exercise = pgTable(
  "exercise",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").unique(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    description: text("description"),
    descriptionEn: text("description_en"),
    searchText: text("search_text").notNull(),
    bodyPart: text("body_part").$type<ExerciseBodyPart>().notNull(),
    category: text("category").$type<ExerciseCategory>().notNull(),
    equipment: text("equipment").$type<ExerciseEquipment>().notNull(),
    machineKind: text("machine_kind").$type<ExerciseMachineKind>(),
    target: text("target").$type<ExerciseTarget>().notNull(),
    secondaryMuscles: text("secondary_muscles")
      .array()
      .$type<ExerciseSecondaryMuscle[]>()
      .notNull()
      .default([]),
    mapPrimary: text("map_primary")
      .array()
      .$type<BodyMapMuscle[]>()
      .notNull()
      .default([]),
    mapSecondary: text("map_secondary")
      .array()
      .$type<BodyMapMuscle[]>()
      .notNull()
      .default([]),
    muscleWeights: jsonb("muscle_weights")
      .$type<Partial<Record<BodyMapMuscle, number>>>()
      .notNull()
      .default({}),
    needs: text("needs").array().$type<ExerciseNeed[]>().notNull().default([]),
    hold: boolean("hold").default(false).notNull(),
    track: text("track").$type<ExerciseTrack>(),
    instructions: text("instructions").array().notNull().default([]),
    instructionsEn: text("instructions_en").array().notNull().default([]),
    image: text("image"),
    video: text("video"),
    femaleImage: text("female_image"),
    femaleVideo: text("female_video"),
    classic: boolean("classic").default(false).notNull(),
    popularity: integer("popularity").default(0).notNull(),
    source: text("source").notNull(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    archived: boolean("archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("exercise_body_part_idx").on(t.bodyPart),
    index("exercise_target_idx").on(t.target),
    index("exercise_clinic_idx").on(t.clinicId),
    index("exercise_search_trgm").using(
      "gin",
      sql`${t.searchText} gin_trgm_ops`,
    ),
    check("exercise_body_part_check", oneOf(t.bodyPart, EXERCISE_BODY_PARTS)),
    check("exercise_category_check", oneOf(t.category, EXERCISE_CATEGORIES)),
    check("exercise_equipment_check", oneOf(t.equipment, EXERCISE_EQUIPMENT)),
    check(
      "exercise_machine_kind_check",
      sql`${t.machineKind} is null or ${oneOf(t.machineKind, EXERCISE_MACHINE_KINDS)}`,
    ),
    check("exercise_target_check", oneOf(t.target, EXERCISE_TARGETS)),
    check(
      "exercise_secondary_muscles_check",
      allOf(t.secondaryMuscles, EXERCISE_SECONDARY_MUSCLES),
    ),
    check("exercise_map_primary_check", allOf(t.mapPrimary, BODY_MAP_MUSCLES)),
    check(
      "exercise_map_secondary_check",
      allOf(t.mapSecondary, BODY_MAP_MUSCLES),
    ),
    check("exercise_needs_check", allOf(t.needs, EXERCISE_NEEDS)),
    check(
      "exercise_track_check",
      sql`${t.track} is null or ${oneOf(t.track, EXERCISE_TRACKS)}`,
    ),
    check("exercise_source_check", oneOf(t.source, ["opengym", "custom"])),
  ],
);

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
    ...timestamps,
  },
  (t) => [
    index("exercise_sub_lookup_idx").on(t.clinicId, t.exerciseId),
    index("exercise_sub_substitute_idx").on(t.substituteExerciseId),
    uniqueIndex("exercise_sub_base_uq")
      .on(t.exerciseId, t.substituteExerciseId)
      .where(sql`${t.clinicId} is null`),
    uniqueIndex("exercise_sub_clinic_uq")
      .on(t.clinicId, t.exerciseId, t.substituteExerciseId)
      .where(sql`${t.clinicId} is not null`),
    check(
      "exercise_sub_not_self",
      sql`${t.exerciseId} <> ${t.substituteExerciseId}`,
    ),
  ],
);

export const diet = pgTable(
  "diet",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    notes: text("notes"),
    archived: boolean("archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("diet_clinic_idx").on(t.clinicId),
    uniqueIndex("diet_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
);

export const dietMeal = pgTable(
  "diet_meal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dietId: uuid("diet_id")
      .notNull()
      .references(() => diet.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    time: text("time"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("diet_meal_diet_idx").on(t.dietId)],
);

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
    measureLabel: text("measure_label"),
    measureGrams: doublePrecision("measure_grams"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("diet_meal_item_meal_idx").on(t.dietMealId),
    index("diet_meal_item_food_idx").on(t.foodId),
    check("diet_meal_item_grams_positive", sql`${t.grams} > 0`),
    check(
      "diet_meal_item_measure_pair",
      sql`(${t.measureLabel} is null) = (${t.measureGrams} is null)`,
    ),
  ],
);

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
    measureLabel: text("measure_label"),
    measureGrams: doublePrecision("measure_grams"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("diet_item_sub_item_idx").on(t.dietMealItemId),
    index("diet_item_sub_food_idx").on(t.foodId),
    check("diet_item_sub_grams_positive", sql`${t.grams} > 0`),
    check(
      "diet_item_sub_measure_pair",
      sql`(${t.measureLabel} is null) = (${t.measureGrams} is null)`,
    ),
  ],
);

export const studentDiet = pgTable(
  "student_diet",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceDietId: uuid("source_diet_id").references(() => diet.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<StudentDietStatus>()
      .default("draft")
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("student_diet_clinic_idx").on(t.clinicId),
    index("student_diet_student_idx").on(t.studentId),
    uniqueIndex("student_diet_one_active_uq")
      .on(t.studentId)
      .where(sql`${t.status} = 'active'`),
    check("student_diet_status_check", oneOf(t.status, STUDENT_DIET_STATUSES)),
  ],
);

export const studentDietVersion = pgTable(
  "student_diet_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentDietId: uuid("student_diet_id")
      .notNull()
      .references(() => studentDiet.id, { onDelete: "cascade" }),
    version: integer("version"),
    status: text("status")
      .$type<StudentDietVersionStatus>()
      .default("draft")
      .notNull(),
    tree: jsonb("tree").$type<DietStructure>().notNull(),
    notes: text("notes"),
    publishedAt: timestamp("published_at"),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("student_diet_version_diet_idx").on(t.studentDietId),
    unique("student_diet_version_number_uq").on(t.studentDietId, t.version),
    uniqueIndex("student_diet_version_one_draft_uq")
      .on(t.studentDietId)
      .where(sql`${t.status} = 'draft'`),
    check(
      "student_diet_version_status_check",
      oneOf(t.status, STUDENT_DIET_VERSION_STATUSES),
    ),
    check(
      "student_diet_version_published_shape",
      sql`(${t.status} = 'published') = (${t.version} is not null and ${t.publishedAt} is not null)`,
    ),
  ],
);

export const workout = pgTable(
  "workout",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    notes: text("notes"),
    cardio: text("cardio"),
    archived: boolean("archived").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    index("workout_clinic_idx").on(t.clinicId),
    uniqueIndex("workout_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
);

export const workoutSession = pgTable(
  "workout_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workout.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workout_session_workout_idx").on(t.workoutId)],
);

export const workoutExercise = pgTable(
  "workout_exercise",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSession.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "restrict" }),
    sets: integer("sets").notNull(),
    reps: jsonb("reps").$type<WorkoutReps>().notNull(),
    load: text("load"),
    rest: integer("rest").notNull().default(90),
    note: text("note"),
    technique: text("technique").$type<WorkoutTechnique>(),
    groupId: text("group_id"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("workout_exercise_session_idx").on(t.workoutSessionId),
    index("workout_exercise_exercise_idx").on(t.exerciseId),
    check("workout_exercise_sets_positive", sql`${t.sets} > 0`),
    check("workout_exercise_rest_non_negative", sql`${t.rest} >= 0`),
    check(
      "workout_exercise_technique_check",
      sql`${t.technique} is null or ${oneOf(t.technique, WORKOUT_TECHNIQUES)}`,
    ),
  ],
);

export const workoutExerciseSubstitute = pgTable(
  "workout_exercise_substitute",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutExerciseId: uuid("workout_exercise_id")
      .notNull()
      .references(() => workoutExercise.id, { onDelete: "cascade" }),
    substituteExerciseId: uuid("substitute_exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "restrict" }),
    note: text("note"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("workout_ex_sub_item_idx").on(t.workoutExerciseId),
    index("workout_ex_sub_exercise_idx").on(t.substituteExerciseId),
  ],
);

export const studentWorkout = pgTable(
  "student_workout",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceWorkoutId: uuid("source_workout_id").references(() => workout.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<StudentWorkoutStatus>()
      .default("draft")
      .notNull(),
    ...timestamps,
  },
  (t) => [
    index("student_workout_clinic_idx").on(t.clinicId),
    index("student_workout_student_idx").on(t.studentId),
    uniqueIndex("student_workout_one_active_uq")
      .on(t.studentId)
      .where(sql`${t.status} = 'active'`),
    check(
      "student_workout_status_check",
      oneOf(t.status, STUDENT_WORKOUT_STATUSES),
    ),
  ],
);

export const studentWorkoutVersion = pgTable(
  "student_workout_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentWorkoutId: uuid("student_workout_id")
      .notNull()
      .references(() => studentWorkout.id, { onDelete: "cascade" }),
    version: integer("version"),
    status: text("status")
      .$type<StudentWorkoutVersionStatus>()
      .default("draft")
      .notNull(),
    tree: jsonb("tree").$type<WorkoutStructure>().notNull(),
    notes: text("notes"),
    cardio: text("cardio"),
    publishedAt: timestamp("published_at"),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("student_workout_version_workout_idx").on(t.studentWorkoutId),
    unique("student_workout_version_number_uq").on(
      t.studentWorkoutId,
      t.version,
    ),
    uniqueIndex("student_workout_version_one_draft_uq")
      .on(t.studentWorkoutId)
      .where(sql`${t.status} = 'draft'`),
    check(
      "student_workout_version_status_check",
      oneOf(t.status, STUDENT_WORKOUT_VERSION_STATUSES),
    ),
    check(
      "student_workout_version_published_shape",
      sql`(${t.status} = 'published') = (${t.version} is not null and ${t.publishedAt} is not null)`,
    ),
  ],
);

export const anamnesis = pgTable(
  "anamnesis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    description: text("description"),
    objective: text("objective").$type<AnamnesisObjective>().notNull(),
    modality: text("modality").$type<AnamnesisModality>().notNull(),
    sections: jsonb("sections").$type<AnamnesisSection[]>().notNull(),
    ...timestamps,
  },
  (t) => [
    index("anamnesis_clinic_idx").on(t.clinicId),
    uniqueIndex("anamnesis_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
    check(
      "anamnesis_objective_check",
      oneOf(t.objective, ANAMNESIS_OBJECTIVE_VALUES),
    ),
    check(
      "anamnesis_modality_check",
      oneOf(t.modality, ANAMNESIS_MODALITY_VALUES),
    ),
  ],
);

export const studentAnamnesis = pgTable(
  "student_anamnesis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    sourceAnamnesisId: uuid("source_anamnesis_id").references(
      () => anamnesis.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    sections: jsonb("sections").$type<AnamnesisSection[]>().notNull(),
    answers: jsonb("answers").$type<AnamnesisAnswers>().notNull().default({}),
    status: text("status")
      .$type<StudentAnamnesisStatus>()
      .default("pending")
      .notNull(),
    filledBy: text("filled_by").$type<AnamnesisFilledBy>(),
    filledAt: timestamp("filled_at"),
    fillTokenHash: text("fill_token_hash").unique(),
    fillTokenExpiresAt: timestamp("fill_token_expires_at"),
    ...timestamps,
  },
  (t) => [
    index("student_anamnesis_clinic_idx").on(t.clinicId),
    unique("student_anamnesis_student_uq").on(t.studentId),
    check(
      "student_anamnesis_status_check",
      oneOf(t.status, STUDENT_ANAMNESIS_STATUS_VALUES),
    ),
    check(
      "student_anamnesis_filled_by_check",
      sql`${t.filledBy} is null or ${oneOf(t.filledBy, ANAMNESIS_FILLED_BY_VALUES)}`,
    ),
    check(
      "student_anamnesis_token_pair",
      sql`(${t.fillTokenHash} is null) = (${t.fillTokenExpiresAt} is null)`,
    ),
  ],
);

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    data: jsonb("data").$type<NotificationData>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("notification_clinic_created_idx").on(t.clinicId, t.createdAt),
    check("notification_type_check", oneOf(t.type, NOTIFICATION_TYPES)),
  ],
);

export const notificationRead = pgTable(
  "notification_read",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notification.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.notificationId, t.userId] }),
    index("notification_read_user_idx").on(t.userId),
  ],
);

export const studentCheckin = pgTable(
  "student_checkin",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    author: text("author").$type<CheckinAuthor>().notNull(),
    modality: text("modality").$type<Modality>().notNull(),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    weightKg: doublePrecision("weight_kg"),
    note: text("note"),
    feedback: text("feedback"),
    feedbackAt: timestamp("feedback_at"),
    feedbackByUserId: text("feedback_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    dietVersionId: uuid("diet_version_id").references(
      () => studentDietVersion.id,
      { onDelete: "set null" },
    ),
    dietName: text("diet_name"),
    dietVersion: integer("diet_version"),
    workoutVersionId: uuid("workout_version_id").references(
      () => studentWorkoutVersion.id,
      { onDelete: "set null" },
    ),
    workoutName: text("workout_name"),
    workoutVersion: integer("workout_version"),
    ...timestamps,
  },
  (t) => [
    index("student_checkin_clinic_idx").on(t.clinicId),
    index("student_checkin_student_date_idx").on(t.studentId, t.date),
    check("student_checkin_author_check", oneOf(t.author, CHECKIN_AUTHORS)),
    check("student_checkin_modality_check", oneOf(t.modality, MODALITIES)),
    check(
      "student_checkin_weight_positive",
      sql`${t.weightKg} is null or ${t.weightKg} > 0`,
    ),
  ],
);

export const checkinAssessment = pgTable(
  "checkin_assessment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => studentCheckin.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    assessedAt: date("assessed_at", { mode: "string" }).notNull(),
    protocol: text("protocol").$type<AssessmentPreset>().notNull(),
    circumferences: jsonb("circumferences")
      .$type<CheckinCircumferences>()
      .default({})
      .notNull(),
    skinfolds: jsonb("skinfolds")
      .$type<CheckinSkinfolds>()
      .default({})
      .notNull(),
    bodyFatPct: doublePrecision("body_fat_pct"),
    bodyFatSource: text("body_fat_source").$type<BodyFatSource>(),
    recordedByUserId: text("recorded_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("checkin_assessment_clinic_idx").on(t.clinicId),
    index("checkin_assessment_student_idx").on(t.studentId),
    unique("checkin_assessment_checkin_uq").on(t.checkinId),
    check(
      "checkin_assessment_protocol_check",
      oneOf(t.protocol, ASSESSMENT_PRESETS),
    ),
    check(
      "checkin_assessment_body_fat_source_check",
      sql`${t.bodyFatSource} is null or ${oneOf(t.bodyFatSource, BODY_FAT_SOURCES)}`,
    ),
    check(
      "checkin_assessment_body_fat_pair",
      sql`(${t.bodyFatPct} is null) = (${t.bodyFatSource} is null)`,
    ),
  ],
);

export const studentCheckinPhoto = pgTable(
  "student_checkin_photo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => studentCheckin.id, { onDelete: "cascade" }),
    pose: text("pose").$type<CheckinPose>().notNull(),
    storageKey: text("storage_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("student_checkin_photo_checkin_idx").on(t.checkinId),
    unique("student_checkin_photo_pose_uq").on(t.checkinId, t.pose),
    check("student_checkin_photo_pose_check", oneOf(t.pose, CHECKIN_POSES)),
  ],
);

export const aiGeneration = pgTable(
  "ai_generation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .references(() => clinic.id, { onDelete: "cascade" })
      .notNull(),
    studentId: uuid("student_id")
      .references(() => student.id, { onDelete: "cascade" })
      .notNull(),
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<AiGenerationKind>().notNull(),
    status: text("status")
      .$type<AiGenerationStatus>()
      .default("pending")
      .notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    upstreamProvider: text("upstream_provider"),
    requestId: text("request_id"),
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    outputTokens: integer("output_tokens"),
    reportedCostMicroUsd: integer("reported_cost_micro_usd"),
    durationMs: integer("duration_ms"),
    repaired: boolean("repaired").default(false).notNull(),
    catalogHash: text("catalog_hash"),
    anamnesisSnapshotId: uuid("anamnesis_snapshot_id").references(
      () => studentAnamnesis.id,
      { onDelete: "set null" },
    ),
    errorCode: text("error_code"),
    ...timestamps,
  },
  (t) => [
    index("ai_generation_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("ai_generation_student_idx").on(t.studentId),
    index("ai_generation_created_idx").on(t.createdAt),
    check("ai_generation_kind_check", oneOf(t.kind, AI_GENERATION_KINDS)),
    check(
      "ai_generation_status_check",
      oneOf(t.status, AI_GENERATION_STATUSES),
    ),
  ],
);

export const checkinEvaluation = pgTable(
  "checkin_evaluation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => studentCheckin.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    aiGenerationId: uuid("ai_generation_id").references(() => aiGeneration.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<EvaluationStatus>()
      .default("pending")
      .notNull(),
    payload: jsonb("payload").$type<AiEvaluationPayload>().notNull(),
    bodyFatPct: doublePrecision("body_fat_pct"),
    bodyFatSource: text("body_fat_source").$type<BodyFatSource>(),
    confidence: text("confidence").$type<EvaluationConfidence>(),
    decidedByUserId: text("decided_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    ...timestamps,
  },
  (t) => [
    index("checkin_evaluation_clinic_idx").on(t.clinicId),
    index("checkin_evaluation_student_idx").on(t.studentId),
    unique("checkin_evaluation_checkin_uq").on(t.checkinId),
    check(
      "checkin_evaluation_status_check",
      oneOf(t.status, EVALUATION_STATUSES),
    ),
    check(
      "checkin_evaluation_body_fat_source_check",
      sql`${t.bodyFatSource} is null or ${oneOf(t.bodyFatSource, BODY_FAT_SOURCES)}`,
    ),
    check(
      "checkin_evaluation_confidence_check",
      sql`${t.confidence} is null or ${oneOf(t.confidence, EVALUATION_CONFIDENCES)}`,
    ),
  ],
);

export const studentNote = pgTable(
  "student_note",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => student.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id").references(() => studentCheckin.id, {
      onDelete: "set null",
    }),
    source: text("source").$type<NoteSource>().default("manual").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").$type<AiEvaluationPayload>(),
    acceptance: text("acceptance").$type<NoteAcceptance>(),
    bodyFatPct: doublePrecision("body_fat_pct"),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("student_note_clinic_idx").on(t.clinicId),
    index("student_note_student_created_idx").on(t.studentId, t.createdAt),
    check("student_note_source_check", oneOf(t.source, NOTE_SOURCES)),
    check(
      "student_note_acceptance_check",
      sql`${t.acceptance} is null or ${oneOf(t.acceptance, NOTE_ACCEPTANCES)}`,
    ),
    check(
      "student_note_ai_shape",
      sql`(${t.source} = 'ai_evaluation') = (${t.payload} is not null and ${t.acceptance} is not null)`,
    ),
  ],
);

export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => student.id, {
      onDelete: "set null",
    }),
    coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type")
      .$type<CalendarEventType>()
      .default("presencial")
      .notNull(),
    title: text("title").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("calendar_event_clinic_date_idx").on(t.clinicId, t.date),
    index("calendar_event_student_idx").on(t.studentId),
    check("calendar_event_type_check", oneOf(t.type, CALENDAR_EVENT_TYPES)),
    check(
      "calendar_event_time_format",
      sql`(${t.startTime} is null or ${t.startTime} ~ '^[0-2][0-9]:[0-5][0-9]$') and (${t.endTime} is null or ${t.endTime} ~ '^[0-2][0-9]:[0-5][0-9]$')`,
    ),
  ],
);

export const whatsappConversation = pgTable(
  "whatsapp_conversation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => student.id, {
      onDelete: "cascade",
    }),
    phone: text("phone").notNull(),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageDirection: text(
      "last_message_direction",
    ).$type<WhatsAppMessageDirection>(),
    unreadCount: integer("unread_count").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("whatsapp_conversation_clinic_phone_uq").on(
      t.clinicId,
      t.phone,
    ),
    index("whatsapp_conversation_clinic_last_idx").on(
      t.clinicId,
      t.lastMessageAt,
    ),
    index("whatsapp_conversation_student_idx").on(t.studentId),
    check(
      "whatsapp_conversation_direction_check",
      sql`${t.lastMessageDirection} is null or ${oneOf(t.lastMessageDirection, WHATSAPP_MESSAGE_DIRECTIONS)}`,
    ),
    check(
      "whatsapp_conversation_unread_non_negative",
      sql`${t.unreadCount} >= 0`,
    ),
  ],
);

export const whatsappMessage = pgTable(
  "whatsapp_message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversation.id, { onDelete: "cascade" }),
    direction: text("direction").$type<WhatsAppMessageDirection>().notNull(),
    type: text("type").$type<WhatsAppMessageType>().default("text").notNull(),
    body: text("body").notNull(),
    templateKey: text("template_key"),
    status: text("status")
      .$type<WhatsAppMessageStatus>()
      .default("sent")
      .notNull(),
    providerMessageId: text("provider_message_id"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("whatsapp_message_clinic_conv_idx").on(
      t.clinicId,
      t.conversationId,
      t.createdAt,
    ),
    index("whatsapp_message_provider_idx").on(t.providerMessageId),
    check(
      "whatsapp_message_direction_check",
      oneOf(t.direction, WHATSAPP_MESSAGE_DIRECTIONS),
    ),
    check("whatsapp_message_type_check", oneOf(t.type, WHATSAPP_MESSAGE_TYPES)),
    check(
      "whatsapp_message_status_check",
      oneOf(t.status, WHATSAPP_MESSAGE_STATUSES),
    ),
    check(
      "whatsapp_message_template_shape",
      sql`(${t.type} = 'template') = (${t.templateKey} is not null)`,
    ),
  ],
);

export const whatsappTemplate = pgTable(
  "whatsapp_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status")
      .$type<WhatsAppTemplateStatus>()
      .default("approved")
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("whatsapp_template_base_key_uq")
      .on(t.key)
      .where(sql`${t.clinicId} is null`),
    uniqueIndex("whatsapp_template_clinic_key_uq")
      .on(t.clinicId, t.key)
      .where(sql`${t.clinicId} is not null`),
    check(
      "whatsapp_template_status_check",
      oneOf(t.status, WHATSAPP_TEMPLATE_STATUSES),
    ),
  ],
);

export const whatsappConnection = pgTable(
  "whatsapp_connection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .unique("whatsapp_connection_clinic_uq")
      .references(() => clinic.id, { onDelete: "cascade" }),
    provider: text("provider"),
    status: text("status")
      .$type<WhatsAppConnectionStatus>()
      .default("disconnected")
      .notNull(),
    phone: text("phone"),
    metaAccountName: text("meta_account_name"),
    connectedAt: timestamp("connected_at"),
    ...timestamps,
  },
  (t) => [
    check(
      "whatsapp_connection_status_check",
      oneOf(t.status, WHATSAPP_CONNECTION_STATUSES),
    ),
  ],
);

export const aiSettings = pgTable("ai_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  singleton: boolean("singleton").default(true).notNull().unique(),
  model: text("model").notNull(),
  fallbackModels: text("fallback_models").array().notNull().default([]),
  visionModel: text("vision_model"),
  visionFallbackModels: text("vision_fallback_models")
    .array()
    .notNull()
    .default([]),
  ...timestamps,
});

export const providerPrice = pgTable(
  "provider_price",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    inputMicroUsdPerMtok: integer("input_micro_usd_per_mtok").notNull(),
    outputMicroUsdPerMtok: integer("output_micro_usd_per_mtok").notNull(),
    cachedInputMicroUsdPerMtok: integer("cached_input_micro_usd_per_mtok"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_price_model_from_idx").on(
      t.provider,
      t.model,
      t.effectiveFrom,
    ),
  ],
);

export const userRelations = relations(user, ({ one, many }) => ({
  sessions: many(session),
  accounts: many(account),
  clinic: one(clinic, {
    fields: [user.clinicId],
    references: [clinic.id],
    relationName: "clinicMembers",
  }),
  ownedClinics: many(clinic, { relationName: "clinicOwner" }),
  coachedStudents: many(student, { relationName: "studentCoach" }),
}));

export const clinicRelations = relations(clinic, ({ one, many }) => ({
  owner: one(user, {
    fields: [clinic.ownerUserId],
    references: [user.id],
    relationName: "clinicOwner",
  }),
  members: many(user, { relationName: "clinicMembers" }),
  students: many(student),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const studentRelations = relations(student, ({ one, many }) => ({
  clinic: one(clinic, { fields: [student.clinicId], references: [clinic.id] }),
  coach: one(user, {
    fields: [student.coachId],
    references: [user.id],
    relationName: "studentCoach",
  }),
  account: one(user, { fields: [student.userId], references: [user.id] }),
  invitations: many(invitation),
  diets: many(studentDiet),
  workouts: many(studentWorkout),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  clinic: one(clinic, {
    fields: [invitation.clinicId],
    references: [clinic.id],
  }),
  student: one(student, {
    fields: [invitation.studentId],
    references: [student.id],
  }),
}));

export const foodGroupRelations = relations(foodGroup, ({ many }) => ({
  foods: many(food),
}));

export const nutrientRelations = relations(nutrient, ({ many }) => ({
  values: many(foodNutrient),
}));

export const foodRelations = relations(food, ({ one, many }) => ({
  group: one(foodGroup, { fields: [food.groupId], references: [foodGroup.id] }),
  clinic: one(clinic, { fields: [food.clinicId], references: [clinic.id] }),
  nutrients: many(foodNutrient),
  substitutions: many(foodSubstitution, { relationName: "substitutionMain" }),
  substituteFor: many(foodSubstitution, {
    relationName: "substitutionSubstitute",
  }),
  favoritedBy: many(foodFavorite),
}));

export const foodNutrientRelations = relations(foodNutrient, ({ one }) => ({
  food: one(food, { fields: [foodNutrient.foodId], references: [food.id] }),
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
  food: one(food, { fields: [foodMeasure.foodId], references: [food.id] }),
}));

export const foodFavoriteRelations = relations(foodFavorite, ({ one }) => ({
  clinic: one(clinic, {
    fields: [foodFavorite.clinicId],
    references: [clinic.id],
  }),
  food: one(food, { fields: [foodFavorite.foodId], references: [food.id] }),
}));

export const exerciseRelations = relations(exercise, ({ one, many }) => ({
  clinic: one(clinic, { fields: [exercise.clinicId], references: [clinic.id] }),
  substitutions: many(exerciseSubstitution, {
    relationName: "exerciseSubstitutionMain",
  }),
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
  clinic: one(clinic, { fields: [diet.clinicId], references: [clinic.id] }),
  coach: one(user, { fields: [diet.coachId], references: [user.id] }),
  meals: many(dietMeal),
}));

export const dietMealRelations = relations(dietMeal, ({ one, many }) => ({
  diet: one(diet, { fields: [dietMeal.dietId], references: [diet.id] }),
  items: many(dietMealItem),
}));

export const dietMealItemRelations = relations(
  dietMealItem,
  ({ one, many }) => ({
    meal: one(dietMeal, {
      fields: [dietMealItem.dietMealId],
      references: [dietMeal.id],
    }),
    food: one(food, { fields: [dietMealItem.foodId], references: [food.id] }),
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

export const workoutRelations = relations(workout, ({ one, many }) => ({
  clinic: one(clinic, { fields: [workout.clinicId], references: [clinic.id] }),
  coach: one(user, { fields: [workout.coachId], references: [user.id] }),
  sessions: many(workoutSession),
}));

export const workoutSessionRelations = relations(
  workoutSession,
  ({ one, many }) => ({
    workout: one(workout, {
      fields: [workoutSession.workoutId],
      references: [workout.id],
    }),
    exercises: many(workoutExercise),
  }),
);

export const workoutExerciseRelations = relations(
  workoutExercise,
  ({ one, many }) => ({
    session: one(workoutSession, {
      fields: [workoutExercise.workoutSessionId],
      references: [workoutSession.id],
    }),
    exercise: one(exercise, {
      fields: [workoutExercise.exerciseId],
      references: [exercise.id],
    }),
    substitutes: many(workoutExerciseSubstitute),
  }),
);

export const workoutExerciseSubstituteRelations = relations(
  workoutExerciseSubstitute,
  ({ one }) => ({
    item: one(workoutExercise, {
      fields: [workoutExerciseSubstitute.workoutExerciseId],
      references: [workoutExercise.id],
    }),
    exercise: one(exercise, {
      fields: [workoutExerciseSubstitute.substituteExerciseId],
      references: [exercise.id],
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
    student: one(student, {
      fields: [studentDiet.studentId],
      references: [student.id],
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

export const studentWorkoutRelations = relations(
  studentWorkout,
  ({ one, many }) => ({
    clinic: one(clinic, {
      fields: [studentWorkout.clinicId],
      references: [clinic.id],
    }),
    student: one(student, {
      fields: [studentWorkout.studentId],
      references: [student.id],
    }),
    sourceWorkout: one(workout, {
      fields: [studentWorkout.sourceWorkoutId],
      references: [workout.id],
    }),
    versions: many(studentWorkoutVersion),
  }),
);

export const studentWorkoutVersionRelations = relations(
  studentWorkoutVersion,
  ({ one }) => ({
    workout: one(studentWorkout, {
      fields: [studentWorkoutVersion.studentWorkoutId],
      references: [studentWorkout.id],
    }),
    publisher: one(user, {
      fields: [studentWorkoutVersion.publishedBy],
      references: [user.id],
    }),
  }),
);

export const studentAnamnesisRelations = relations(
  studentAnamnesis,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [studentAnamnesis.clinicId],
      references: [clinic.id],
    }),
    student: one(student, {
      fields: [studentAnamnesis.studentId],
      references: [student.id],
    }),
    source: one(anamnesis, {
      fields: [studentAnamnesis.sourceAnamnesisId],
      references: [anamnesis.id],
    }),
  }),
);

export const notificationRelations = relations(
  notification,
  ({ one, many }) => ({
    clinic: one(clinic, {
      fields: [notification.clinicId],
      references: [clinic.id],
    }),
    reads: many(notificationRead),
  }),
);

export const notificationReadRelations = relations(
  notificationRead,
  ({ one }) => ({
    notification: one(notification, {
      fields: [notificationRead.notificationId],
      references: [notification.id],
    }),
    user: one(user, { fields: [notificationRead.userId], references: [user.id] }),
  }),
);

export const studentCheckinRelations = relations(
  studentCheckin,
  ({ one, many }) => ({
    clinic: one(clinic, {
      fields: [studentCheckin.clinicId],
      references: [clinic.id],
    }),
    student: one(student, {
      fields: [studentCheckin.studentId],
      references: [student.id],
    }),
    author: one(user, {
      fields: [studentCheckin.authorUserId],
      references: [user.id],
    }),
    feedbackBy: one(user, {
      fields: [studentCheckin.feedbackByUserId],
      references: [user.id],
    }),
    photos: many(studentCheckinPhoto),
    assessment: one(checkinAssessment, {
      fields: [studentCheckin.id],
      references: [checkinAssessment.checkinId],
    }),
  }),
);

export const checkinAssessmentRelations = relations(
  checkinAssessment,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [checkinAssessment.clinicId],
      references: [clinic.id],
    }),
    checkin: one(studentCheckin, {
      fields: [checkinAssessment.checkinId],
      references: [studentCheckin.id],
    }),
    student: one(student, {
      fields: [checkinAssessment.studentId],
      references: [student.id],
    }),
  }),
);

export const studentCheckinPhotoRelations = relations(
  studentCheckinPhoto,
  ({ one }) => ({
    checkin: one(studentCheckin, {
      fields: [studentCheckinPhoto.checkinId],
      references: [studentCheckin.id],
    }),
  }),
);

export const checkinEvaluationRelations = relations(
  checkinEvaluation,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [checkinEvaluation.clinicId],
      references: [clinic.id],
    }),
    checkin: one(studentCheckin, {
      fields: [checkinEvaluation.checkinId],
      references: [studentCheckin.id],
    }),
    student: one(student, {
      fields: [checkinEvaluation.studentId],
      references: [student.id],
    }),
  }),
);

export const studentNoteRelations = relations(studentNote, ({ one }) => ({
  clinic: one(clinic, {
    fields: [studentNote.clinicId],
    references: [clinic.id],
  }),
  student: one(student, {
    fields: [studentNote.studentId],
    references: [student.id],
  }),
  checkin: one(studentCheckin, {
    fields: [studentNote.checkinId],
    references: [studentCheckin.id],
  }),
  author: one(user, {
    fields: [studentNote.authorUserId],
    references: [user.id],
  }),
}));

export type AiSettings = typeof aiSettings.$inferSelect;
export type NewAiSettings = typeof aiSettings.$inferInsert;
export type ProviderPrice = typeof providerPrice.$inferSelect;
export type NewProviderPrice = typeof providerPrice.$inferInsert;
export type AiGeneration = typeof aiGeneration.$inferSelect;
export type NewAiGeneration = typeof aiGeneration.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Clinic = typeof clinic.$inferSelect;
export type NewClinic = typeof clinic.$inferInsert;
export type Student = typeof student.$inferSelect;
export type NewStudent = typeof student.$inferInsert;
export type PlanLimit = typeof planLimit.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItem.$inferSelect;
export type ClinicPlanChange = typeof clinicPlanChange.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
export type AdminInvitation = typeof adminInvitation.$inferSelect;
export type CoachInvitation = typeof coachInvitation.$inferSelect;
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
export type Anamnesis = typeof anamnesis.$inferSelect;
export type NewAnamnesis = typeof anamnesis.$inferInsert;
export type StudentAnamnesis = typeof studentAnamnesis.$inferSelect;
export type NewStudentAnamnesis = typeof studentAnamnesis.$inferInsert;
export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
export type NotificationRead = typeof notificationRead.$inferSelect;
export type NewNotificationRead = typeof notificationRead.$inferInsert;
export type StudentCheckin = typeof studentCheckin.$inferSelect;
export type NewStudentCheckin = typeof studentCheckin.$inferInsert;
export type StudentCheckinPhoto = typeof studentCheckinPhoto.$inferSelect;
export type NewStudentCheckinPhoto = typeof studentCheckinPhoto.$inferInsert;
export type CheckinAssessment = typeof checkinAssessment.$inferSelect;
export type NewCheckinAssessment = typeof checkinAssessment.$inferInsert;
export type CheckinEvaluation = typeof checkinEvaluation.$inferSelect;
export type NewCheckinEvaluation = typeof checkinEvaluation.$inferInsert;
export type StudentNote = typeof studentNote.$inferSelect;
export type NewStudentNote = typeof studentNote.$inferInsert;
export type CalendarEvent = typeof calendarEvent.$inferSelect;
export type NewCalendarEvent = typeof calendarEvent.$inferInsert;
export type WhatsappConversation = typeof whatsappConversation.$inferSelect;
export type NewWhatsappConversation = typeof whatsappConversation.$inferInsert;
export type WhatsappMessage = typeof whatsappMessage.$inferSelect;
export type NewWhatsappMessage = typeof whatsappMessage.$inferInsert;
export type WhatsappTemplate = typeof whatsappTemplate.$inferSelect;
export type NewWhatsappTemplate = typeof whatsappTemplate.$inferInsert;
export type WhatsappConnection = typeof whatsappConnection.$inferSelect;
export type NewWhatsappConnection = typeof whatsappConnection.$inferInsert;
