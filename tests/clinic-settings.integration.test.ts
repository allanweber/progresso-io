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
      headline: null,
      description: null,
      whatsapp: null,
      instagram: null,
      siteUrl: null,
      accentColor: null,
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
      headline: null,
      description: null,
      whatsapp: null,
      instagram: null,
      siteUrl: null,
      accentColor: null,
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

describe("public branded portal", () => {
  const branding = {
    headline: "Olá",
    description: "Descrição",
    whatsapp: "+55 11 98888-0000",
    instagram: "@branda",
    siteUrl: "https://branda.com",
    accentColor: "#123456",
    feedbackFrequency: "semanal" as const,
    feedbackPreferredDay: "monday" as const,
    feedbackWhatsappReminder: true,
  };

  it("resolves branding only for a paid clinic with a slug set", async () => {
    const ctx = await coachContext("brand-a@example.com", "Brand A");
    await clinics.updateClinicSettings(ctx, {
      name: "Brand A",
      portalSubdomain: "brand-a",
      ...branding,
    });

    // Free plan (the sign-up default) → the portal is not published.
    expect(await clinics.getPublicClinicBySlug(h, "brand-a")).toBeNull();

    // Upgrade to a paid plan → it resolves, with only public branding fields.
    await h
      .update(schema.clinic)
      .set({ plan: "solo" })
      .where(eq(schema.clinic.id, ctx.clinicId));
    const pub = await clinics.getPublicClinicBySlug(h, "brand-a");
    expect(pub).not.toBeNull();
    expect(pub!.name).toBe("Brand A");
    expect(pub!.headline).toBe("Olá");
    expect(pub!.accentColor).toBe("#123456");
    expect(pub!.hasLogo).toBe(false);
  });

  it("returns null for an unknown slug", async () => {
    expect(await clinics.getPublicClinicBySlug(h, "nope-nope-nope")).toBeNull();
  });

  it("stops resolving when the clinic downgrades to free", async () => {
    const ctx = await coachContext("brand-b@example.com", "Brand B");
    await h
      .update(schema.clinic)
      .set({ plan: "clinica" })
      .where(eq(schema.clinic.id, ctx.clinicId));
    await clinics.updateClinicSettings(ctx, {
      name: "Brand B",
      portalSubdomain: "brand-b",
      ...branding,
    });
    expect(await clinics.getPublicClinicBySlug(h, "brand-b")).not.toBeNull();

    await h
      .update(schema.clinic)
      .set({ plan: "free" })
      .where(eq(schema.clinic.id, ctx.clinicId));
    expect(await clinics.getPublicClinicBySlug(h, "brand-b")).toBeNull();
  });
});
