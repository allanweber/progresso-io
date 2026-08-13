// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { admin, plans, students as studentsDal } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

async function ownerContext(email: string, plan: schema.Plan): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name: "Owner", email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, user.clinicId!));
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });

  // Migration 0025 seeds plan_limit; reset to a known set for this test.
  await db.delete(schema.planLimit);
  await db.insert(schema.planLimit).values([
    { plan: "solo", maxStudents: 50, maxCoaches: 1, whatsapp: true },
    { plan: "clinica", maxStudents: 100, maxCoaches: 3, whatsapp: true },
  ]);
});

describe("per-clinic limit overrides", () => {
  it("inherits plan defaults when no override is set", async () => {
    const ctx = await ownerContext("inherit@example.com", "solo");
    expect(await plans.getPlanLimits(ctx)).toEqual({
      maxStudents: 50,
      maxCoaches: 1,
      whatsapp: true,
      archive: true,
      calendar: true,
    });
  });

  it("applies overrides on top of the plan (higher cap, WhatsApp forced off)", async () => {
    const ctx = await ownerContext("override@example.com", "solo");
    const row = await admin.updateClinicLimits(h, ctx.clinicId, {
      maxStudentsOverride: 200,
      maxCoachesOverride: null, // inherit
      whatsappOverride: false,
      archiveOverride: null,
    });
    expect(row).toMatchObject({
      maxStudentsOverride: 200,
      maxCoachesOverride: null,
      whatsappOverride: false,
    });

    // Effective = override where set, else plan default.
    expect(await plans.getPlanLimits(ctx)).toEqual({
      maxStudents: 200, // override
      maxCoaches: 1, // inherited from plan
      whatsapp: false, // forced off for this clinic
      archive: true, // inherited from plan
      calendar: true, // inherited from plan
    });
  });

  it("getClinicLimits reports both the plan defaults and the overrides", async () => {
    const ctx = await ownerContext("report@example.com", "clinica");
    await admin.updateClinicLimits(h, ctx.clinicId, {
      maxStudentsOverride: null,
      maxCoachesOverride: 5,
      whatsappOverride: null,
      archiveOverride: null,
    });
    const limits = await admin.getClinicLimits(h, ctx.clinicId);
    expect(limits).toMatchObject({
      plan: "clinica",
      planMaxStudents: 100,
      planMaxCoaches: 3,
      maxCoachesOverride: 5,
      maxStudentsOverride: null,
    });
  });
});

describe("student archive capability + hard delete", () => {
  it("resolves the archive capability from the per-clinic override", async () => {
    const ctx = await ownerContext("archive@example.com", "solo");
    // The plan_limit row here defaults archive=true; forcing the override off.
    await admin.updateClinicLimits(h, ctx.clinicId, {
      maxStudentsOverride: null,
      maxCoachesOverride: null,
      whatsappOverride: null,
      archiveOverride: false,
    });
    expect(await plans.canArchiveStudents(ctx)).toBe(false);

    await admin.updateClinicLimits(h, ctx.clinicId, {
      maxStudentsOverride: null,
      maxCoachesOverride: null,
      whatsappOverride: null,
      archiveOverride: null,
    });
    expect(await plans.canArchiveStudents(ctx)).toBe(true); // back to plan default
  });

  it("hard-deletes a student, scoped to the clinic", async () => {
    const ctx = await ownerContext("harddel@example.com", "solo");
    const s = await studentsDal.createStudent(ctx, {
      firstName: "Del",
      lastName: "Eter",
    });
    expect(await studentsDal.hardDeleteStudent(ctx, s.id)).toBe(true);

    const rows = await h
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, s.id));
    expect(rows).toHaveLength(0);

    // Already gone (and never in another clinic) → false, not a throw.
    expect(await studentsDal.hardDeleteStudent(ctx, s.id)).toBe(false);
  });
});
