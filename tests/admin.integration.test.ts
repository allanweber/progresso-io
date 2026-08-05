// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import type { TenantContext } from "@/server/tenant";
import { admin, invitations, students as studentsDal } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let ctxA: TenantContext;
let ctxB: TenantContext;

const password = "supersegura123";

async function coachContext(email: string, name: string): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  return {
    db: db as unknown as DB,
    clinicId: user.clinicId!,
    userId: user.id,
    role: "coach",
  };
}

/** Accepts an invite the way the accept route does, returning the new user id. */
async function activateLogin(
  ctx: TenantContext,
  studentId: string,
  email: string,
  name: string,
): Promise<string> {
  const { invitation } = await invitations.createInvitation(ctx, studentId);
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [newUser] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  await db
    .update(schema.user)
    .set({ role: "aluno", clinicId: invitation.clinicId, emailVerified: true })
    .where(eq(schema.user.id, newUser.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, newUser.id));
  await studentsDal.linkStudentAccount(db as unknown as DB, {
    clinicId: invitation.clinicId,
    studentId,
    userId: newUser.id,
  });
  await invitations.markAccepted(db as unknown as DB, invitation.id);
  return newUser.id;
}

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });

  ctxA = await coachContext("coach-a@example.com", "Coach A");
  ctxB = await coachContext("coach-b@example.com", "Coach B");
});

describe("admin: platform-wide student list", () => {
  it("lists students across clinics, filters by clinic and e-mail", async () => {
    await studentsDal.createStudent(ctxA, {
      firstName: "Ana",
      lastName: "Alpha",
      email: "ana@alpha.com",
      modality: "online",
    });
    await studentsDal.createStudent(ctxB, {
      firstName: "Bruno",
      lastName: "Beta",
      email: "bruno@beta.com",
      modality: "online",
    });

    const all = await admin.listAllStudents(db as unknown as DB);
    expect(all.length).toBe(2);
    // Each row carries its clinic name (the admin table shows it).
    expect(all.every((r) => typeof r.clinicName === "string" && r.clinicName)).toBe(
      true,
    );

    const byClinic = await admin.listAllStudents(db as unknown as DB, {
      clinicId: ctxA.clinicId,
    });
    expect(byClinic.map((r) => r.email)).toEqual(["ana@alpha.com"]);

    const byEmail = await admin.listAllStudents(db as unknown as DB, {
      email: "beta",
    });
    expect(byEmail.map((r) => r.email)).toEqual(["bruno@beta.com"]);
  });

  it("lists clinics for the filter", async () => {
    const clinics = await admin.listClinics(db as unknown as DB);
    expect(clinics.length).toBe(2);
    expect(clinics.every((c) => c.id && c.name)).toBe(true);
  });
});

describe("admin: hard delete", () => {
  it("removes a student and its pending invitations from every table", async () => {
    const student = await studentsDal.createStudent(ctxA, {
      firstName: "Carla",
      lastName: "Gamma",
      email: "carla@gamma.com",
      modality: "online",
    });
    await invitations.createInvitation(ctxA, student.id);

    const result = await admin.hardDeleteStudent(db as unknown as DB, student.id);
    expect(result).toEqual({ deleted: true, deletedUser: false });

    // Gone from students…
    const rows = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, student.id));
    expect(rows).toHaveLength(0);
    // …and its invitations cascaded away.
    const invites = await db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.studentId, student.id));
    expect(invites).toHaveLength(0);
  });

  it("also deletes the aluno's login, sessions and accounts", async () => {
    const student = await studentsDal.createStudent(ctxA, {
      firstName: "Diego",
      lastName: "Delta",
      email: "diego@delta.com",
      modality: "online",
    });
    const userId = await activateLogin(ctxA, student.id, "diego@delta.com", "Diego Delta");

    // Sanity: the login and its credential row exist before deletion.
    expect(
      (await db.select().from(schema.account).where(eq(schema.account.userId, userId)))
        .length,
    ).toBeGreaterThan(0);

    const result = await admin.hardDeleteStudent(db as unknown as DB, student.id);
    expect(result).toEqual({ deleted: true, deletedUser: true });

    expect(
      await db.select().from(schema.user).where(eq(schema.user.id, userId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.account).where(eq(schema.account.userId, userId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.session).where(eq(schema.session.userId, userId)),
    ).toHaveLength(0);
  });

  it("reports deleted: false for an unknown id", async () => {
    const result = await admin.hardDeleteStudent(
      db as unknown as DB,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toEqual({ deleted: false, deletedUser: false });
  });
});
