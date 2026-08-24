import { and, asc, desc, eq, ilike, inArray, type SQL, sql } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Plan, Student } from "@/db/schema";

/**
 * Platform-admin clinic + cross-clinic student views.
 *
 * Part of the admin DAL: takes a raw {@link DB} handle and is intentionally NOT
 * clinic-scoped. See `./index.ts` for why that exception exists and what gates
 * it.
 */

export type AdminStudentFilters = {
  clinicId?: string;
  /** Case-insensitive substring match on the student's e-mail. */
  email?: string;
};

/** A student plus its clinic name and portal-access flag, for the admin table. */
export type AdminStudentRow = Student & {
  clinicName: string;
  hasAccount: boolean;
};

/** All clinics (id + name) for the admin's clinic filter. */
export async function listClinics(
  db: DB,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: schema.clinic.id, name: schema.clinic.name })
    .from(schema.clinic)
    .orderBy(schema.clinic.name);
}

/** A clinic enriched with its owner and member counts, for the admin manager. */
export type AdminClinicRow = {
  id: string;
  name: string;
  plan: Plan;
  /** The plan picked at sign-up. Intent only — never granted. */
  intendedPlan: Plan | null;
  /** End of the sign-up trial. Only in force while `plan` is still `free`. */
  trialEndsAt: Date | null;
  ownerName: string | null;
  ownerEmail: string | null;
  coachCount: number;
  studentCount: number;
  createdAt: Date;
};

/**
 * Every clinic on the platform with its owner and how many coaches + students it
 * holds — the payload for the admin "Clínicas" manager. Cross-tenant, admin only.
 * (Superset of {@link listClinics}: the id/name filters keep working off it.)
 */
export async function listAllClinics(db: DB): Promise<AdminClinicRow[]> {
  return db
    .select({
      id: schema.clinic.id,
      name: schema.clinic.name,
      plan: schema.clinic.plan,
      // Subscription context for the admin detail page: what the coach asked
      // for at sign-up (so the manual fatura bills the right plan) and when the
      // trial runs out (it is never a `plan`, so it can't be read from above).
      intendedPlan: schema.clinic.intendedPlan,
      trialEndsAt: schema.clinic.trialEndsAt,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
      createdAt: schema.clinic.createdAt,
      coachCount: sql<number>`(
        select count(*)::int from "user" u
        where u.clinic_id = ${schema.clinic.id} and u.role = 'coach'
      )`,
      studentCount: sql<number>`(
        select count(*)::int from students s where s.clinic_id = ${schema.clinic.id}
      )`,
    })
    .from(schema.clinic)
    .leftJoin(schema.user, eq(schema.user.id, schema.clinic.ownerUserId))
    .orderBy(asc(schema.clinic.name));
}

/** A single clinic enriched like {@link listAllClinics}, or null. Admin only. */
export async function getClinicAdminRow(
  db: DB,
  id: string,
): Promise<AdminClinicRow | null> {
  const [row] = await db
    .select({
      id: schema.clinic.id,
      name: schema.clinic.name,
      plan: schema.clinic.plan,
      // Subscription context for the admin detail page: what the coach asked
      // for at sign-up (so the manual fatura bills the right plan) and when the
      // trial runs out (it is never a `plan`, so it can't be read from above).
      intendedPlan: schema.clinic.intendedPlan,
      trialEndsAt: schema.clinic.trialEndsAt,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
      createdAt: schema.clinic.createdAt,
      coachCount: sql<number>`(
        select count(*)::int from "user" u
        where u.clinic_id = ${schema.clinic.id} and u.role = 'coach'
      )`,
      studentCount: sql<number>`(
        select count(*)::int from students s where s.clinic_id = ${schema.clinic.id}
      )`,
    })
    .from(schema.clinic)
    .leftJoin(schema.user, eq(schema.user.id, schema.clinic.ownerUserId))
    .where(eq(schema.clinic.id, id));
  return row ?? null;
}

/**
 * Hard-deletes a clinic and EVERYTHING that belongs to it — the whole tenant.
 * Runs in one transaction:
 * - deleting the `clinic` row cascades every clinic-scoped table (students,
 *   invitations, diets, workouts, anamneses, the clinic's own foods/exercises +
 *   their substitutions/measures/favorites, notifications) via their
 *   `clinic_id` FKs, and nulls `user.clinic_id` for its members;
 * - then the clinic's own user accounts (its coaches + activated alunos, captured
 *   before the delete) are removed, cascading their sessions + accounts.
 *
 * Platform admins are never members of a clinic (`clinic_id IS NULL`), so this
 * can never touch an admin. Returns `deleted: false` when the id is unknown;
 * `deletedUsers` is how many logins were removed.
 */
export async function hardDeleteClinic(
  db: DB,
  clinicId: string,
): Promise<{ deleted: boolean; deletedUsers: number }> {
  return db.transaction(async (tx) => {
    const [clinic] = await tx
      .select({ id: schema.clinic.id })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, clinicId));
    if (!clinic) return { deleted: false, deletedUsers: 0 };

    // The clinic's user accounts (owner + coaches + activated alunos). Captured
    // now because deleting the clinic nulls their `clinic_id`.
    const members = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.clinicId, clinicId));

    // The clinic row first — all clinic-scoped data cascades away with it.
    await tx.delete(schema.clinic).where(eq(schema.clinic.id, clinicId));

    // Then the tenant's logins — sessions and accounts cascade from each.
    if (members.length > 0) {
      await tx.delete(schema.user).where(
        inArray(
          schema.user.id,
          members.map((m) => m.id),
        ),
      );
    }

    return { deleted: true, deletedUsers: members.length };
  });
}

/**
 * Every student on the platform (optionally filtered by clinic and/or e-mail),
 * ordered by clinic then newest-first. Cross-tenant by design — admin only.
 */
export async function listAllStudents(
  db: DB,
  filters: AdminStudentFilters = {},
): Promise<AdminStudentRow[]> {
  const conditions: SQL[] = [];
  if (filters.clinicId) {
    conditions.push(eq(schema.students.clinicId, filters.clinicId));
  }
  if (filters.email) {
    conditions.push(ilike(schema.students.email, `%${filters.email}%`));
  }

  const rows = await db
    .select({ student: schema.students, clinicName: schema.clinic.name })
    .from(schema.students)
    .innerJoin(schema.clinic, eq(schema.students.clinicId, schema.clinic.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.clinic.name, desc(schema.students.createdAt));

  return rows.map((r) => ({
    ...r.student,
    clinicName: r.clinicName,
    hasAccount: r.student.userId !== null,
  }));
}

/**
 * Hard-deletes a student and everything tied to it — the destructive
 * counterpart to a coach's soft `archiveStudent`, reserved for platform admins.
 *
 * Runs in one transaction and clears the student from EVERY table it touches:
 * - `students` — the row itself.
 * - `invitation` — cascades from the student row (FK `onDelete: cascade`).
 * - `user` — the aluno's login, if they activated one; deleting it cascades
 *   their `session` and `account` rows (both FK `onDelete: cascade`).
 *
 * Returns `deleted: false` when the id doesn't exist. `deletedUser` reports
 * whether a linked login was removed too.
 */
export async function hardDeleteStudent(
  db: DB,
  studentId: string,
): Promise<{ deleted: boolean; deletedUser: boolean }> {
  return db.transaction(async (tx) => {
    const [student] = await tx
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, studentId));
    if (!student) return { deleted: false, deletedUser: false };

    // The student row first — its invitations cascade away with it.
    await tx.delete(schema.students).where(eq(schema.students.id, studentId));

    // Then the aluno's login, if any — sessions and accounts cascade from it.
    let deletedUser = false;
    if (student.userId) {
      await tx.delete(schema.user).where(eq(schema.user.id, student.userId));
      deletedUser = true;
    }

    return { deleted: true, deletedUser };
  });
}
