// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { clinics } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

/** Signs up a coach (which bootstraps their clinic) and returns a context. */
async function coachContext(email: string, name: string): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("clinic settings", () => {
  it("persists Clínica + feedback fields and keeps the plan read-only", async () => {
    const ctx = await coachContext("settings-a@example.com", "Coach A");

    const before = await clinics.getClinicSettings(ctx);
    expect(before).not.toBeNull();
    // Defaults from the migration.
    expect(before!.feedbackFrequency).toBe("semanal");
    expect(before!.feedbackPreferredDay).toBe("monday");
    expect(before!.feedbackWhatsappReminder).toBe(true);
    expect(before!.portalSubdomain).toBeNull();
    const originalPlan = before!.plan;

    await clinics.updateClinicSettings(ctx, {
      name: "Studio Forja",
      portalSubdomain: "studio-forja",
      feedbackFrequency: "mensal",
      feedbackPreferredDay: "friday",
      feedbackWhatsappReminder: false,
    });

    const after = await clinics.getClinicSettings(ctx);
    expect(after).toMatchObject({
      name: "Studio Forja",
      portalSubdomain: "studio-forja",
      feedbackFrequency: "mensal",
      feedbackPreferredDay: "friday",
      feedbackWhatsappReminder: false,
      // The update never touches the plan (chosen at sign-up).
      plan: originalPlan,
    });
  });

  it("scopes updates to the caller's clinic and detects subdomain conflicts", async () => {
    const ctxA = await coachContext("settings-b@example.com", "Coach B");
    const ctxB = await coachContext("settings-c@example.com", "Coach C");

    await clinics.updateClinicSettings(ctxA, {
      name: "Clínica B",
      portalSubdomain: "clinica-b",
      feedbackFrequency: "semanal",
      feedbackPreferredDay: "monday",
      feedbackWhatsappReminder: true,
    });

    // B's write did not leak into C's clinic.
    const cSettings = await clinics.getClinicSettings(ctxB);
    expect(cSettings!.name).not.toBe("Clínica B");
    expect(cSettings!.portalSubdomain).toBeNull();

    // The subdomain is taken from another clinic's point of view…
    expect(await clinics.isSubdomainTaken(ctxB, "clinica-b")).toBe(true);
    // …but never conflicts with the clinic that owns it (re-saving is fine)…
    expect(await clinics.isSubdomainTaken(ctxA, "clinica-b")).toBe(false);
    // …and a free slug is available to anyone.
    expect(await clinics.isSubdomainTaken(ctxB, "clinica-c")).toBe(false);
  });
});
