import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
 * login once they accept an invite; null while only provisioned.
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
    // The aluno's own login, once invited.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.clinicId, table.email)],
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

export const studentsRelations = relations(students, ({ one }) => ({
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
}));

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
