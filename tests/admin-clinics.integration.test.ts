// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { admin, students as studentsDal } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

/** Signs up a coach (which bootstraps their clinic) and returns both ids. */
async function coachClinic(
  email: string,
  name: string,
): Promise<{ userId: string; clinicId: string }> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  return { userId: user.id, clinicId: user.clinicId! };
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("admin clinics manager", () => {
  it("lists clinics with their owner and coach/student counts", async () => {
    const a = await coachClinic("owner-a@example.com", "Owner A");
    const ctxA: TenantContext = {
      db: h,
      clinicId: a.clinicId,
      userId: a.userId,
      role: "coach",
    };
    await studentsDal.createStudent(ctxA, {
      firstName: "S1",
      lastName: "x",
      email: "s1@example.com",
      modality: "online",
    });

    const row = (await admin.listAllClinics(h)).find((c) => c.id === a.clinicId)!;
    expect(row.ownerEmail).toBe("owner-a@example.com");
    expect(row.ownerName).toBe("Owner A");
    expect(row.coachCount).toBe(1);
    expect(row.studentCount).toBe(1);
  });

  it("hard-deletes a clinic: wipes its data + users, leaves others intact", async () => {
    const victim = await coachClinic("owner-b@example.com", "Owner B");
    const survivor = await coachClinic("owner-c@example.com", "Owner C");
    const ctxV: TenantContext = {
      db: h,
      clinicId: victim.clinicId,
      userId: victim.userId,
      role: "coach",
    };
    const student = await studentsDal.createStudent(ctxV, {
      firstName: "Vic",
      lastName: "Tim",
      email: "vic@example.com",
      modality: "online",
    });

    const res = await admin.hardDeleteClinic(h, victim.clinicId);
    expect(res.deleted).toBe(true);
    expect(res.deletedUsers).toBe(1); // the owner coach

    // The clinic and its clinic-scoped data are gone.
    expect(
      await db
        .select()
        .from(schema.clinic)
        .where(eq(schema.clinic.id, victim.clinicId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.students)
        .where(eq(schema.students.id, student.id)),
    ).toHaveLength(0);
    // The owner's login is gone too.
    expect(await admin.getUserById(h, victim.userId)).toBeNull();

    // A different clinic and its owner are untouched.
    expect(
      await db
        .select()
        .from(schema.clinic)
        .where(eq(schema.clinic.id, survivor.clinicId)),
    ).toHaveLength(1);
    expect(await admin.getUserById(h, survivor.userId)).not.toBeNull();
  });

  it("returns deleted:false for an unknown clinic", async () => {
    const res = await admin.hardDeleteClinic(
      h,
      "00000000-0000-0000-0000-000000000000",
    );
    expect(res).toEqual({ deleted: false, deletedUsers: 0 });
  });
});
