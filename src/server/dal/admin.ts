import { and, desc, eq, ilike, type SQL } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Student } from "@/db/schema";

/**
 * Platform-admin DAL — the one deliberate exception to the tenant-scoping rule.
 *
 * Every other DAL module takes a {@link import("@/server/tenant").TenantContext}
 * and scopes each query by `clinicId`. A platform admin (`role = "admin"`) works
 * ACROSS clinics and belongs to none, so these functions take a raw {@link DB}
 * handle and are intentionally NOT clinic-scoped. That power is gated at the
 * route layer: every caller MUST pass `getAdminSession()` first (see
 * `src/server/admin.ts`), so nothing here is reachable by a coach or aluno.
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
