import { relations, sql } from "drizzle-orm";
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

import type {
  AnamnesisModality,
  AnamnesisObjective,
  AnamnesisSection,
} from "@/lib/anamneses";
import type {
  AnamnesisAnswers,
  AnamnesisFilledBy,
  StudentAnamnesisStatus,
} from "@/lib/student-anamneses";
import type {
  CheckinCircumferences,
  CheckinSkinfolds,
} from "@/lib/checkin-assessment";
import type { NotificationData, NotificationType } from "@/lib/notifications";
import type { DietStructure } from "@/lib/student-diets";
import type {
  WhatsAppConnectionStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  WhatsAppTemplateStatus,
} from "@/lib/whatsapp-inbox";
import type { WorkoutStructure } from "@/lib/student-workouts";
import type { WorkoutReps } from "@/lib/workouts";
import type { WorkoutTechnique } from "@/lib/workout-techniques";

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
 * What the AI program generator can draft. One generation produces exactly one
 * of these and costs exactly one credit — a workout and a diet for the same
 * aluno are two generations, because they are two model calls.
 */
export const AI_GENERATION_KINDS = ["workout", "diet"] as const;
export type AiGenerationKind = (typeof AI_GENERATION_KINDS)[number];

/**
 * Lifecycle of a generation. The row is written `pending` **before** the model
 * is called, so an in-flight generation already holds its credit and two
 * concurrent requests cannot both slip under the cap. `failed` rows stop
 * counting, which is what makes a provider error free for the coach.
 */
export const AI_GENERATION_STATUSES = [
  "pending",
  "succeeded",
  "failed",
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

/**
 * A clinic's default check-in cadence for its students (a clinic-wide feedback
 * preference). Stored on {@link clinic}; the check-in engine that consumes it is
 * a later feature.
 */
export const FEEDBACK_FREQUENCIES = ["semanal", "quinzenal", "mensal"] as const;
export type FeedbackFrequency = (typeof FEEDBACK_FREQUENCIES)[number];

/** Days of the week, for the clinic's preferred check-in day. */
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
export const clinic = pgTable(
  "clinic",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    plan: text("plan").$type<Plan>().default("free").notNull(),
    // The coach who created the clinic. Not cascaded, so removing an owner never
    // silently drops a whole clinic's data.
    ownerUserId: text("owner_user_id")
      .notNull()
      .references((): AnyPgColumn => user.id),
    // Portal slug — the clinic's branded microsite + login live at
    // app.progresso.io/<slug> (path-based, same origin). Optional; globally unique
    // when set. Validated (slug + reserved-word blocklist) at the zod layer; only
    // paid plans may set it (gated in the settings route).
    portalSubdomain: text("portal_subdomain"),
    // Branded-portal fields, shown on the public microsite + branded login. All
    // optional; only meaningful when `portalSubdomain` is set on a paid plan.
    // `logoKey` is a storage key served via the public logo route.
    logoKey: text("logo_key"),
    headline: text("headline"),
    description: text("description"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    siteUrl: text("site_url"),
    accentColor: text("accent_color"),
    // Clinic-wide feedback preferences (the "Preferências de feedback" settings
    // section). Persisted now; the check-in engine that consumes them is a later
    // feature.
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
    // Per-clinic capability overrides, set by a platform admin on the clinic
    // detail page. NULL = inherit the plan default (`plan_limit`); a value takes
    // precedence over the plan for THIS clinic only. Lets a single clinic get a
    // higher (or lower) cap, or WhatsApp toggled, without changing its plan.
    maxStudentsOverride: integer("max_students_override"),
    maxCoachesOverride: integer("max_coaches_override"),
    whatsappOverride: boolean("whatsapp_override"),
    archiveOverride: boolean("archive_override"),
    calendarOverride: boolean("calendar_override"),
    aiGenerationsOverride: integer("ai_generations_override"),
    // When the clinic's starter templates (anamneses + diets + workouts) were
    // seeded. NULL until the first coach sign-in triggers the one-shot background
    // seed (see `ensureClinicStarters`); set to the completion time once all
    // starters are in. Read before seeding, so the run happens exactly once.
    startersSeededAt: timestamp("starters_seeded_at"),
    // End of the 14-day trial granted at sign-up. While this is in the future
    // AND `plan` is still `free`, the clinic resolves to **Solo** limits — see
    // `getPlanLimits`. The trial is deliberately NOT a `plan` value: keeping the
    // stored plan honest means `clinic_plan_change` stays an audit of real plan
    // changes, and expiry is a date comparison that is correct even if no job
    // ever runs (a cron only sends the "faltam N dias" nudge). NULL = no trial.
    trialEndsAt: timestamp("trial_ends_at"),
    // The plan the coach picked in the sign-up wizard. Recorded as *intent* only
    // — it is never granted (that would hand out paid plans for free). Read when
    // issuing the manual fatura so the right plan is billed. NULL = not asked.
    intendedPlan: text("intended_plan").$type<Plan>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // Subdomain is unique across the platform, but only when set (blank clinics
    // don't collide) — same partial-unique shape as the students email/phone keys.
    uniqueIndex("clinic_portal_subdomain_uq")
      .on(t.portalSubdomain)
      .where(sql`${t.portalSubdomain} is not null`),
  ],
);

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
    // Contact + identity. Both are conditional: an ONLINE student must have a
    // WhatsApp (phone) AND an e-mail (the portal login); an OFFLINE student may
    // have either or neither. The requiredness is enforced at the zod layer;
    // the columns are nullable so offline students are representable. Phone is
    // stored normalized (see @/lib/phone) so the uniqueness index is canonical.
    email: text("email"),
    phone: text("phone"),
    goal: text("goal"),
    status: text("status").$type<StudentStatus>().default("active").notNull(),
    modality: text("modality").$type<Modality>().default("online").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // WhatsApp is the primary identifier — unique per clinic when present.
    uniqueIndex("students_clinic_phone_uq")
      .on(table.clinicId, table.phone)
      .where(sql`${table.phone} is not null`),
    // E-mail stays unique per clinic, but only when present (nullable now).
    uniqueIndex("students_clinic_email_uq")
      .on(table.clinicId, table.email)
      .where(sql`${table.email} is not null`),
  ],
);

/**
 * Per-plan capabilities a clinic gets. Reference data (not tenant-scoped), keyed
 * by the lowercase plan name so limits are edited in the database rather than
 * hardcoded. `maxStudents`/`maxCoaches = null` means unlimited (both the "no cap"
 * plans and a missing row, which must never block). `whatsapp` gates the WhatsApp
 * delivery channel — free clinics onboard over e-mail only.
 */
export const planLimit = pgTable("plan_limit", {
  plan: text("plan").$type<Plan>().primaryKey(),
  maxStudents: integer("max_students"),
  // Max coaches (incl. the owner) that may belong to the clinic. null = unlimited.
  maxCoaches: integer("max_coaches"),
  // Whether the plan may send over WhatsApp (paid plans) or e-mail only (free).
  whatsapp: boolean("whatsapp").default(true).notNull(),
  // Whether the plan may ARCHIVE (soft-remove) students. Free/Solo can't — they
  // hard-delete instead; Clínica/Enterprise can keep archived history.
  archive: boolean("archive").default(true).notNull(),
  // Whether the plan may use the coach Calendar/Agenda. Free is excluded; every
  // paid plan (Solo/Clínica/Enterprise) gets it.
  calendar: boolean("calendar").default(true).notNull(),
  // AI program generations allowed per calendar month. null = unlimited.
  // Unlike the boolean capabilities this one meters a real marginal cost —
  // every generation is a paid model call — which is why even the top
  // self-serve plan carries a number rather than `null`.
  aiGenerations: integer("ai_generations"),
});

/* -------------------------------------------------------------------------- */
/*  Manual billing (no gateway yet — platform admins manage plans + invoices)  */
/* -------------------------------------------------------------------------- */

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

/**
 * A manually-managed invoice for a clinic (the billing unit). There is no
 * payment gateway yet: a platform admin creates invoices and marks them
 * paid/canceled by hand. Money is stored in integer **BRL cents**. The invoice
 * total is `sum(line items) − discount`, computed in the DAL (never stored, so
 * it can't drift from the items). "Overdue" is derived (pending + past due), not
 * a stored status. Independent of `clinic.plan` — paying an invoice does NOT
 * change the plan; `plan_snapshot` just records which plan it was billed for.
 */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // Platform-wide human-friendly number (e.g. #0001), assigned on create.
    number: integer("number").notNull(),
    status: text("status").$type<InvoiceStatus>().default("pending").notNull(),
    // Reference month (competência), stored as the first day of that month.
    competencia: date("competencia").notNull(),
    issuedAt: date("issued_at").notNull(),
    dueDate: date("due_date").notNull(),
    paidAt: date("paid_at"),
    paymentMethod: text("payment_method").$type<PaymentMethod>(),
    // Discount off the summed line items (BRL cents), with an optional reason.
    discountCents: integer("discount_cents").default(0).notNull(),
    discountReason: text("discount_reason"),
    // Which plan this invoice was billed for (snapshot; independent of the
    // clinic's current plan).
    planSnapshot: text("plan_snapshot").$type<Plan>().notNull(),
    notes: text("notes"),
    // The admin who created it (kept for the audit trail; nulled if removed).
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("invoice_clinic_idx").on(t.clinicId),
    uniqueIndex("invoice_number_uq").on(t.number),
  ],
);

/** One charge line on an invoice (description + BRL cents), ordered by position. */
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

/**
 * Audit trail of a clinic's plan changes (who moved it from → to, when, why).
 * Written whenever an admin changes `clinic.plan`; shown on the admin clinic
 * detail page. `from_plan` is null for the very first record.
 */
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
  (t) => [index("clinic_plan_change_clinic_idx").on(t.clinicId)],
);

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

/**
 * A pending invite for a NEW platform admin to activate their account. Unlike
 * the student `invitation`, it is tied to NO clinic and NO student — an admin
 * belongs to no tenant. Carries the invitee's name + e-mail; the user row is
 * created only when they accept and set a password. The raw token lives only in
 * the e-mailed link (we store its SHA-256 hash). One live invite per e-mail is
 * enforced in the DAL (previous unaccepted ones are superseded).
 */
export const adminInvitation = pgTable("admin_invitation", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  // SHA-256 of the raw token. The raw token is never persisted.
  tokenHash: text("token_hash").notNull().unique(),
  // The admin who sent the invite (audit). Nulled if that admin is later removed.
  invitedByUserId: text("invited_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A pending invite for a NEW coach to join a clinic (the `Clínica` plan's
 * multi-coach team). Clinic-scoped: it carries the inviting `clinicId` plus the
 * invitee's name + e-mail; the `user` row (role `coach`, `clinicId` set) is
 * created only when they accept and set a password. The raw token lives only in
 * the e-mailed link (we store its SHA-256 hash). One live invite per (clinic,
 * e-mail) is enforced in the DAL (previous unaccepted ones are superseded). A
 * pending invite reserves a seat against the plan's `maxCoaches` cap.
 */
export const coachInvitation = pgTable(
  "coach_invitation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    // SHA-256 of the raw token. The raw token is never persisted.
    tokenHash: text("token_hash").notNull().unique(),
    // The coach who sent the invite (audit). Nulled if that user is later removed.
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("coach_invitation_clinic_idx").on(t.clinicId)],
);

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
    // Provenance: the starter template key (e.g. "hipertrofia") when this diet was
    // seeded/imported from the system's starter set; NULL when a coach authored it.
    // Drives the admin "Sistema/Clínica" badge and idempotent re-import.
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    // Free-text notes/observations (PT-BR), optional.
    notes: text("notes"),
    // Soft-delete: archived diets drop out of listings but keep their rows.
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("diet_clinic_idx").on(t.clinicId),
    // At most one copy of a given starter per clinic (import is idempotent).
    uniqueIndex("diet_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
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
    // The prescription **structure** (references: foodId + grams + measure +
    // coach equivalences). Nutrition and catalog substitutes are derived live
    // from the catalog on read (see the DAL's `hydrateStructure`), so a coach's
    // catalog correction reaches every student with no re-publish.
    tree: jsonb("tree").$type<DietStructure>().notNull(),
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
/*  Workouts (treinos — coach-authored training-program templates)             */
/*                                                                            */
/*  A workout is a generic, reusable training-program template — the exercise  */
/*  analogue of a `diet`. `clinic_id = NULL` is a shared base template          */
/*  (reserved for a future platform catalog); a set `clinic_id` is a clinic's   */
/*  own workout, authored by a coach. The DAL reads                             */
/*  `clinic_id IS NULL OR clinic_id = ctx.clinicId` and only writes clinic-owned */
/*  rows. A workout has sessions ("fichas"), each with ordered exercise items.  */
/*  Only the prescription (sets/reps/load/rest/technique) is stored; the        */
/*  exercise's name, images, instructions and substitutes are a live reference  */
/*  into the `exercise` catalog, resolved at read time. Assigning a workout to  */
/*  a student (versioned) uses the `student_workout` tables below.              */
/* -------------------------------------------------------------------------- */

export const workout = pgTable(
  "workout",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // NULL = shared base template; set = this clinic's own workout.
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    // The coach who authored it. NULL for base templates.
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Provenance: the starter template key (e.g. "bro-split-5x") when this workout
    // was seeded/imported from the system's starter set; NULL when a coach authored
    // it. Drives the admin "Sistema/Clínica" badge and idempotent re-import.
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    // Free-text notes/observations (PT-BR), optional.
    notes: text("notes"),
    // Soft-delete: archived workouts drop out of listings but keep their rows.
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("workout_clinic_idx").on(t.clinicId),
    // At most one copy of a given starter per clinic (import is idempotent).
    uniqueIndex("workout_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
);

/** A session (ficha) within a workout (e.g. "Ficha A"), ordered by `position`. */
export const workoutSession = pgTable(
  "workout_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workout.id, { onDelete: "cascade" }),
    // Free-text label (PT-BR), e.g. "Ficha A · Peito e Tríceps".
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workout_session_workout_idx").on(t.workoutId)],
);

/**
 * An exercise line within a session: a reference into the `exercise` catalog
 * plus its prescription. `reps` is a small JSON discriminated value
 * (`{kind:'fixed'|'range'|'failure', …}`); `rest` is in seconds (default 90 =
 * 01:30, `0` allowed for super-set members); `technique` + `group_id` carry the
 * advanced technique and its super-set/giant grouping.
 */
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
    // Free text (e.g. "40 kg", "peso corporal", "70% 1RM"). NULL = unspecified.
    load: text("load"),
    // Rest between sets, in seconds. Default 01:30; 0 = no rest.
    rest: integer("rest").notNull().default(90),
    // A short free-text observation for this exercise (PT-BR), optional.
    note: text("note"),
    // Advanced technique key (see lib/workout-techniques); NULL = simple.
    technique: text("technique").$type<WorkoutTechnique>(),
    // Shared by consecutive items forming a super-set / giant-set block.
    groupId: text("group_id"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("workout_exercise_session_idx").on(t.workoutSessionId),
    index("workout_exercise_exercise_idx").on(t.exerciseId),
    check("workout_exercise_sets_positive", sql`${t.sets} > 0`),
  ],
);

/**
 * A custom substitute cadastrado no treino for a workout exercise:
 * `substitute_exercise` may replace the item's exercise, with an optional note
 * (the coach's reason). Independent of the catalog's `exercise_substitution`
 * rules — those are merged in live on read; these are workout-specific.
 */
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
    // The coach's reason for this swap (PT-BR), optional.
    note: text("note"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("workout_ex_sub_item_idx").on(t.workoutExerciseId),
    index("workout_ex_sub_exercise_idx").on(t.substituteExerciseId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Student workouts (treino do aluno — versioned, reference-based programs)    */
/*                                                                            */
/*  A student's workout belongs to ONE student and is **versioned** (1..N).    */
/*  Each version stores only the prescription **structure** (references +       */
/*  sets/reps/load/rest/technique + custom substitutes) as one JSON document;   */
/*  the exercise presentation is hydrated live from the catalog on read, so a   */
/*  coach's catalog correction reaches every student with no re-publish. A      */
/*  coach builds a draft (invisible to the aluno) and **publishes** it to make  */
/*  it available; each publish numbers a new version. Only one workout is        */
/*  `active` at a time; a new one's first publish archives the previous.        */
/* -------------------------------------------------------------------------- */

export const STUDENT_WORKOUT_STATUSES = [
  "draft",
  "active",
  "archived",
] as const;
export type StudentWorkoutStatus = (typeof STUDENT_WORKOUT_STATUSES)[number];

export const STUDENT_WORKOUT_VERSION_STATUSES = ["draft", "published"] as const;
export type StudentWorkoutVersionStatus =
  (typeof STUDENT_WORKOUT_VERSION_STATUSES)[number];

export const studentWorkout = pgTable(
  "student_workout",
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
    // Provenance: the template workout this was copied from (a loose reference).
    // Set null if that template is later deleted — the copy is independent.
    sourceWorkoutId: uuid("source_workout_id").references(() => workout.id, {
      onDelete: "set null",
    }),
    status: text("status")
      .$type<StudentWorkoutStatus>()
      .default("draft")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_workout_clinic_idx").on(t.clinicId),
    index("student_workout_student_idx").on(t.studentId),
  ],
);

export const studentWorkoutVersion = pgTable(
  "student_workout_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentWorkoutId: uuid("student_workout_id")
      .notNull()
      .references(() => studentWorkout.id, { onDelete: "cascade" }),
    // Assigned on publish (1, 2, 3…); NULL while a draft.
    version: integer("version"),
    status: text("status")
      .$type<StudentWorkoutVersionStatus>()
      .default("draft")
      .notNull(),
    // The prescription **structure** (references + prescription + custom subs).
    // The exercise presentation and library substitutes are derived live from
    // the catalog on read (see the DAL's `hydrateStructure`).
    tree: jsonb("tree").$type<WorkoutStructure>().notNull(),
    notes: text("notes"),
    publishedAt: timestamp("published_at"),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_workout_version_workout_idx").on(t.studentWorkoutId),
    // Published version numbers are unique within a workout (NULL drafts are
    // distinct in Postgres, so this never blocks a draft).
    unique("student_workout_version_number_uq").on(
      t.studentWorkoutId,
      t.version,
    ),
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
/*  Anamneses (anamnese — coach-authored intake questionnaires)                */
/*                                                                            */
/*  Unlike diets/workouts there is NO shared base template: every clinic gets  */
/*  its own copy of a starter set when it is created (see the seed) and owns    */
/*  them outright. `clinic_id` is therefore NOT NULL. The whole questionnaire   */
/*  (sections → questions) is stored as one JSON document; a question is just   */
/*  a label + a basic type (short_text / long_text / boolean). Nothing          */
/*  references the catalog, so there is no live hydration.                      */
/* -------------------------------------------------------------------------- */

export const anamnesis = pgTable(
  "anamnesis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Always a clinic's own — never a shared base template.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // The coach who authored/last-owns it. NULL if the author was removed.
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Provenance: the starter template key (e.g. "hipertrofia") when this row was
    // seeded/imported from the system's starter set; NULL when a coach authored
    // it. Drives the admin "Sistema/Clínica" badge and idempotent re-import.
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    description: text("description"),
    // Profile tags (see lib/anamneses): objective + intended modality.
    objective: text("objective").$type<AnamnesisObjective>().notNull(),
    modality: text("modality").$type<AnamnesisModality>().notNull(),
    // The whole questionnaire: sections → questions, as one JSON document.
    sections: jsonb("sections").$type<AnamnesisSection[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("anamnesis_clinic_idx").on(t.clinicId),
    // At most one copy of a given starter per clinic (import is idempotent).
    uniqueIndex("anamnesis_clinic_source_uq")
      .on(t.clinicId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Student anamnese (the filled questionnaire on a student's profile)         */
/*                                                                            */
/*  Distinct from the reusable `anamnesis` template: it belongs to ONE student */
/*  and stores a **frozen snapshot** of the template's sections/questions plus */
/*  the collected `answers` (keyed by question key). Editing the template later */
/*  never touches this row. One current record per student (edited in place;    */
/*  "usar outro template" replaces the snapshot). Online students fill it via a */
/*  public link gated by a hashed token + a WhatsApp-number confirm; the coach  */
/*  fills it for offline students. Tenant key is `clinic_id`.                   */
/* -------------------------------------------------------------------------- */

export const studentAnamnesis = pgTable(
  "student_anamnesis",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    // Provenance: the template this was snapshotted from (loose reference).
    sourceAnamnesisId: uuid("source_anamnesis_id").references(
      () => anamnesis.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    // Frozen snapshot of the template's sections → questions at assign time.
    sections: jsonb("sections").$type<AnamnesisSection[]>().notNull(),
    // Answers keyed by question key. Empty object until filled.
    answers: jsonb("answers").$type<AnamnesisAnswers>().notNull().default({}),
    status: text("status")
      .$type<StudentAnamnesisStatus>()
      .default("pending")
      .notNull(),
    filledBy: text("filled_by").$type<AnamnesisFilledBy>(),
    filledAt: timestamp("filled_at"),
    // Public fill link (online): SHA-256 of the raw token + its expiry. The raw
    // token lives only in the WhatsApp message; regenerated on resend.
    fillTokenHash: text("fill_token_hash").unique(),
    fillTokenExpiresAt: timestamp("fill_token_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_anamnesis_clinic_idx").on(t.clinicId),
    unique("student_anamnesis_student_uq").on(t.studentId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Notifications (clinic-scoped, per-coach read state)                        */
/*                                                                            */
/*  A generic in-app notification: a `type` + a denormalized `data` payload,    */
/*  scoped to the clinic (every coach sees it). Read-state is per coach in      */
/*  `notification_read`, so each coach has their own unread count. Only one      */
/*  event is raised today: `anamnesis_completed` (an online aluno submitted).    */
/* -------------------------------------------------------------------------- */

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
  (t) => [index("notification_clinic_idx").on(t.clinicId)],
);

/** One row per (notification, coach) that has read it. Absence = unread. */
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
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);

export const studentAnamnesisRelations = relations(
  studentAnamnesis,
  ({ one }) => ({
    clinic: one(clinic, {
      fields: [studentAnamnesis.clinicId],
      references: [clinic.id],
    }),
    student: one(students, {
      fields: [studentAnamnesis.studentId],
      references: [students.id],
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
    user: one(user, {
      fields: [notificationRead.userId],
      references: [user.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Check-ins (aluno progress submissions)                                     */
/*                                                                            */
/*  A dated progress entry for a student: a body weight, an optional note, and  */
/*  up to four physique photos (poses). The `author` discriminates who logged   */
/*  it — the aluno from the portal, or a coach recording an in-person check-in   */
/*  (the coach-side UI is not built yet). Many entries may share a date (a coach */
/*  may annotate the same day the aluno submits), so the timeline orders by      */
/*  (date desc, created_at desc). Photos live in `student_checkin_photo`, one    */
/*  row per pose, each pointing at a stored image key — R2 in production, a      */
/*  local-disk fallback in dev/e2e (see src/server/r2.ts).                       */
/* -------------------------------------------------------------------------- */

export const CHECKIN_AUTHORS = ["student", "coach"] as const;
export type CheckinAuthor = (typeof CHECKIN_AUTHORS)[number];

export const CHECKIN_POSES = [
  "frente",
  "costas",
  "lado_esquerdo",
  "lado_direito",
] as const;
export type CheckinPose = (typeof CHECKIN_POSES)[number];

export const studentCheckin = pgTable(
  "student_checkin",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    // The calendar date of the check-in (no time) — the timeline index. Server-
    // set to "today" for aluno submissions; a coach may backdate an in-person one.
    date: date("date", { mode: "string" }).notNull(),
    // Who logged it. A student submission carries weight + all four poses; a
    // coach in-person entry can carry the same fields (and more, later).
    author: text("author").$type<CheckinAuthor>().default("student").notNull(),
    // The user who created the row (aluno or coach). NULL if that user is later
    // deleted — the entry itself stays on the student's timeline.
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Body weight in kg. Required for aluno submissions (enforced at the zod
    // layer); nullable so a coach note-only entry is representable.
    weightKg: doublePrecision("weight_kg"),
    note: text("note"),
    // The coach's written response to this check-in. A student entry is "pending
    // review" while `feedbackAt` IS NULL; the coach's reply stamps both. Coach-
    // authored entries carry their own note as their message and never pend.
    feedback: text("feedback"),
    feedbackAt: timestamp("feedback_at"),
    feedbackByUserId: text("feedback_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("student_checkin_clinic_idx").on(t.clinicId),
    index("student_checkin_student_date_idx").on(t.studentId, t.date),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Check-in assessment (avaliação física)                                    */
/*                                                                            */
/*  The OPTIONAL body measurements a coach captures during a check-in review   */
/*  or an in-person check-in: circumferences (cm) + skinfolds (mm) as typed    */
/*  jsonb (only the measured sites are stored), plus an optional body-fat %.    */
/*  One assessment per check-in. Weight is NOT here — it lives on the check-in  */
/*  row. See src/lib/checkin-assessment.ts for the site catalog.               */
/* -------------------------------------------------------------------------- */

export const checkinAssessment = pgTable(
  "checkin_assessment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // One assessment per check-in (unique) — deleted with its check-in.
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => studentCheckin.id, { onDelete: "cascade" }),
    // Denormalized for measures-over-time queries without joining the check-in.
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    assessedAt: date("assessed_at", { mode: "string" }).notNull(),
    circumferences: jsonb("circumferences")
      .$type<CheckinCircumferences>()
      .default({})
      .notNull(),
    skinfolds: jsonb("skinfolds")
      .$type<CheckinSkinfolds>()
      .default({})
      .notNull(),
    bodyFatPct: doublePrecision("body_fat_pct"),
    // The coach who recorded it; NULL if that user is later deleted.
    recordedByUserId: text("recorded_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("checkin_assessment_clinic_idx").on(t.clinicId),
    index("checkin_assessment_student_idx").on(t.studentId),
    unique("checkin_assessment_checkin_uq").on(t.checkinId),
  ],
);

export const studentCheckinPhoto = pgTable(
  "student_checkin_photo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — carried on the photo too so every query stays clinic-scoped.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    checkinId: uuid("checkin_id")
      .notNull()
      .references(() => studentCheckin.id, { onDelete: "cascade" }),
    pose: text("pose").$type<CheckinPose>().notNull(),
    // Stored image key (e.g. "checkins/<uuid>.webp"), WITHOUT any bucket prefix
    // — the same shape whether it lives in R2 or the dev local-disk fallback.
    r2Key: text("r2_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("student_checkin_photo_checkin_idx").on(t.checkinId),
    // One photo per pose per check-in.
    unique("student_checkin_photo_pose_uq").on(t.checkinId, t.pose),
  ],
);

export const studentCheckinRelations = relations(
  studentCheckin,
  ({ one, many }) => ({
    clinic: one(clinic, {
      fields: [studentCheckin.clinicId],
      references: [clinic.id],
    }),
    student: one(students, {
      fields: [studentCheckin.studentId],
      references: [students.id],
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
    student: one(students, {
      fields: [checkinAssessment.studentId],
      references: [students.id],
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

/* -------------------------------------------------------------------------- */
/*  Calendar / Agenda (coach scheduling)                                       */
/*                                                                            */
/*  A coach-created calendar event. Clinic-scoped (every coach in the clinic   */
/*  sees them all — attribution only, not access control). The recurring       */
/*  weekly check-in markers the calendar also shows are NOT stored here: they   */
/*  are derived live from the clinic's cadence + each student's check-in        */
/*  history (see src/server/dal/calendar-events.ts). Only ad-hoc events the     */
/*  coach types in live in this table. `studentId` is an optional link (the     */
/*  event can stand alone); it also gives the later WhatsApp-reminder engine a   */
/*  concrete student+phone to message with no schema change.                    */
/* -------------------------------------------------------------------------- */

/**
 * The category of a manual calendar event — drives the colour in the UI.
 *
 * - `checkin`    — a one-off check-in the coach pins by hand (green). Distinct
 *   from the auto-derived weekly check-in markers, which are computed, not stored.
 * - `presencial` — an in-person session / avaliação física (purple).
 * - `admin`      — administrative / renovação (amber): a client renewing their
 *   coaching (paid to the coach offline — students never pay in-app), a meeting.
 */
export const CALENDAR_EVENT_TYPES = ["checkin", "presencial", "admin"] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // Optional student this event is about. Set null if the student is removed —
    // the event stays on the calendar (its title still describes it).
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    // Optional coach the event is attributed to (NOT access control — every
    // coach in the clinic sees all events). Null if that user is later deleted.
    coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type")
      .$type<CalendarEventType>()
      .default("presencial")
      .notNull(),
    title: text("title").notNull(),
    // The calendar day (no time) — always required; the timeline/grid index.
    date: date("date", { mode: "string" }).notNull(),
    // Optional wall-clock time (HH:MM, clinic-local). Null = an all-day event,
    // pinned at the top of the day in the week/day views.
    startTime: text("start_time"),
    endTime: text("end_time"),
    notes: text("notes"),
    // The user who created the event (audit; kept even if they leave).
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // The calendar always reads a clinic's events within a date range.
    index("calendar_event_clinic_date_idx").on(t.clinicId, t.date),
    index("calendar_event_student_idx").on(t.studentId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  WhatsApp inbox                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A WhatsApp conversation thread — one per (clinic, phone). Linked to a student
 * when the number matches one (`studentId`), else kept as an unknown-number
 * thread (studentId null) so nothing inbound is ever lost. The 24h free-text
 * window is NOT stored — it's derived from `lastInboundAt` on read. The
 * `last*` columns denormalize the newest message for a cheap list render.
 */
export const whatsappConversation = pgTable(
  "whatsapp_conversation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // The student behind the number, when known. Set null if the student is
    // removed — the thread survives as an unknown-number conversation.
    studentId: uuid("student_id").references(() => students.id, {
      onDelete: "set null",
    }),
    // Normalized phone (digits only, see @/lib/phone) — the thread's identity.
    phone: text("phone").notNull(),
    // When the person last messaged us — the 24h window anchor. Null = never.
    lastInboundAt: timestamp("last_inbound_at"),
    // Newest message (either direction) for the list preview + ordering.
    lastMessageAt: timestamp("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageDirection: text("last_message_direction")
      .$type<WhatsAppMessageDirection>(),
    // Unanswered inbound counter; reset to 0 when the coach opens the thread.
    unreadCount: integer("unread_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  ],
);

/**
 * A single WhatsApp message in a thread. `direction` is who sent it; `type`
 * distinguishes a free-text session message from a template send; `status`
 * tracks outbound delivery (a real provider upgrades it via status webhooks).
 */
export const whatsappMessage = pgTable(
  "whatsapp_message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — every query MUST filter by this.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversation.id, { onDelete: "cascade" }),
    direction: text("direction").$type<WhatsAppMessageDirection>().notNull(),
    type: text("type").$type<WhatsAppMessageType>().default("text").notNull(),
    // The rendered, sent/received text (template variables already substituted).
    body: text("body").notNull(),
    // The template key when `type = template`, else null.
    templateKey: text("template_key"),
    status: text("status")
      .$type<WhatsAppMessageStatus>()
      .default("sent")
      .notNull(),
    // The vendor's message id, when returned — the key status webhooks match on.
    providerMessageId: text("provider_message_id"),
    // The coach who sent an outbound message (audit; null for inbound).
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
  ],
);

/**
 * A pre-approved template message, per clinic. Only `approved` templates may be
 * sent (esp. when the 24h window is closed). Seeded with a base catalog; a
 * future editor + Meta submission flow reuses `status`.
 */
export const whatsappTemplate = pgTable(
  "whatsapp_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Two-tier: NULL = an app-wide BASE template (seeded once); a set clinicId =
    // a clinic-specific override/addition. Resolution prefers the clinic row,
    // falling back to base by `key` — the foods/exercises base-vs-clinic idiom.
    clinicId: uuid("clinic_id").references(() => clinic.id, {
      onDelete: "cascade",
    }),
    // Stable text code the frontend/automations correlate on (e.g.
    // "checkin_reminder"). Unique per scope (once globally, once per clinic).
    key: text("key").notNull(),
    title: text("title").notNull(),
    // Body with `{nome}`/`{periodo}`/`{link}` placeholders, filled at send time.
    body: text("body").notNull(),
    status: text("status")
      .$type<WhatsAppTemplateStatus>()
      .default("approved")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // One base row per key (partial unique where clinic is null) …
    uniqueIndex("whatsapp_template_base_key_uq")
      .on(t.key)
      .where(sql`${t.clinicId} is null`),
    // … and one row per (clinic, key) for clinic-specific templates.
    uniqueIndex("whatsapp_template_clinic_key_uq").on(t.clinicId, t.key),
  ],
);

/**
 * A clinic's WhatsApp-number connection. One row per clinic (unique). Holds the
 * chosen provider + status + display number + Meta account — the home for real
 * provider credentials later. Absent row = never connected. Powers the coach
 * page's status dot and the admin per-tenant overview.
 */
export const whatsappConnection = pgTable(
  "whatsapp_connection",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant key — one connection per clinic.
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    // The vendor backing this connection (e.g. "meta"), null until chosen.
    provider: text("provider"),
    status: text("status")
      .$type<WhatsAppConnectionStatus>()
      .default("disconnected")
      .notNull(),
    // The clinic's WhatsApp Business display number (normalized), when connected.
    phone: text("phone"),
    metaAccountName: text("meta_account_name"),
    connectedAt: timestamp("connected_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("whatsapp_connection_clinic_uq").on(t.clinicId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  AI program generator                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One row per AI generation attempt — the quota meter, the audit trail, and the
 * cost ledger.
 *
 * **The monthly cap is a `count(*)` over this table**, never a stored counter:
 * a counter needs a cron to reset it and drifts the moment a write fails
 * halfway, while a row count cannot drift. Same reasoning as
 * `clinic.trial_ends_at` — correctness never depends on a job firing.
 *
 * **The prompt itself is deliberately not stored.** `anamnesisSnapshotId` and
 * `catalogHash` make it fully reconstructible without duplicating aluno health
 * data into a second table, in plain text, in every backup.
 */
export const aiGeneration = pgTable(
  "ai_generation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Tenant key. Every read is scoped by this; the cap is counted per clinic.
    clinicId: uuid("clinic_id")
      .references(() => clinic.id, { onDelete: "cascade" })
      .notNull(),
    studentId: uuid("student_id")
      .references(() => students.id, { onDelete: "cascade" })
      .notNull(),
    // Who asked. Kept for the audit trail; nulled if the coach is deleted.
    coachId: text("coach_id").references(() => user.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<AiGenerationKind>().notNull(),
    status: text("status")
      .$type<AiGenerationStatus>()
      .default("pending")
      .notNull(),
    // Which provider/model served this call. Recorded per row because the
    // provider is swappable at runtime — a cost is only interpretable next to
    // the model that produced it.
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    // Input tokens billed at full rate, and the portion served from the
    // provider's prompt cache (billed at a fraction). Split so the cost below
    // is honest about what caching actually saved.
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    /**
     * What this generation cost, in **millionths of a USD**, computed and frozen
     * at write time from the token counts and the configured tariff.
     *
     * Frozen rather than derived on read: a vendor changing its rates must not
     * silently reprice history. `null` when no tariff is configured.
     */
    costMicroUsd: integer("cost_micro_usd"),
    durationMs: integer("duration_ms"),
    // Whether the model's first answer had to be repaired (hallucinated a
    // catalog index). Free for the coach, but worth measuring: a model that
    // needs repairing often costs twice the tokens for the same credit.
    repaired: boolean("repaired").default(false).notNull(),
    /**
     * Hash of the rendered catalog block. The catalog is a global, cached
     * prompt prefix, so this is the cache observability: when hit rates fall,
     * this says whether the prefix changed and when.
     */
    catalogHash: text("catalog_hash"),
    // The anamnese snapshot the prompt was built from. With `catalogHash`, this
    // reconstructs the prompt without storing it.
    anamnesisSnapshotId: uuid("anamnesis_snapshot_id").references(
      () => studentAnamnesis.id,
      { onDelete: "set null" },
    ),
    // Short machine-readable failure cause on `failed` rows ("not_configured",
    // "timeout", "invalid_json", "invalid_ids", "http"). Never the raw provider
    // body — that can echo prompt content.
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // The quota query: this clinic's rows in the current month.
    index("ai_generation_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("ai_generation_student_idx").on(t.studentId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type AiGeneration = typeof aiGeneration.$inferSelect;
export type NewAiGeneration = typeof aiGeneration.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Clinic = typeof clinic.$inferSelect;
export type NewClinic = typeof clinic.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type PlanLimit = typeof planLimit.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItem.$inferSelect;
export type ClinicPlanChange = typeof clinicPlanChange.$inferSelect;
export type Invitation = typeof invitation.$inferSelect;
export type AdminInvitation = typeof adminInvitation.$inferSelect;
export type CoachInvitation = typeof coachInvitation.$inferSelect;
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
