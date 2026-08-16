// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { TRIAL_PLAN } from "@/lib/plans";
import { plans, students as studentsDal } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

/**
 * The 14-day trial (roadmap item 0, Phase 1).
 *
 * The rules under test: a trialing free clinic gets Solo limits, the stored
 * plan is never mutated, expiry is a pure date comparison, expiry is
 * **non-destructive** (alunos added during the trial survive it), and a clinic
 * that actually pays is unaffected by its spent trial.
 */

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let ctx: TenantContext;

const password = "supersegura123";

/** Moves the clinic's trial deadline, or clears it with `null`. */
async function setTrial(endsAt: Date | null) {
  await db
    .update(schema.clinic)
    .set({ trialEndsAt: endsAt })
    .where(eq(schema.clinic.id, ctx.clinicId));
}

async function setPlan(plan: schema.Plan) {
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, ctx.clinicId));
}

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });

  await db.delete(schema.planLimit);
  await db.insert(schema.planLimit).values([
    { plan: "free", maxStudents: 3, whatsapp: false, calendar: false },
    { plan: "solo", maxStudents: 50, whatsapp: true, calendar: true },
    { plan: "clinica", maxStudents: 100, whatsapp: true, calendar: true },
    { plan: "enterprise", maxStudents: null, whatsapp: true, calendar: true },
  ]);

  await auth.api.signUpEmail({
    body: { name: "Trial Coach", email: "trial@example.com", password },
  });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, "trial@example.com"));
  ctx = {
    db: db as unknown as DB,
    clinicId: user.clinicId!,
    userId: user.id,
    role: "coach",
  };
});

beforeEach(async () => {
  // Back to the state sign-up leaves behind: free plan, live trial.
  await setPlan("free");
  await setTrial(inDays(14));
});

describe("trial → Solo limits", () => {
  it("gives a trialing free clinic the Solo caps and capabilities", async () => {
    const limits = await plans.getPlanLimits(ctx);

    expect(limits.trialActive).toBe(true);
    expect(limits.effectivePlan).toBe(TRIAL_PLAN);
    expect(limits.maxStudents).toBe(50);
    expect(limits.whatsapp).toBe(true);
    expect(limits.calendar).toBe(true);
  });

  it("does NOT mutate the stored plan — it stays free", async () => {
    await plans.getPlanLimits(ctx);

    const [clinic] = await db
      .select()
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    // The whole point of modelling the trial as a date: the plan the clinic
    // actually pays for is never rewritten, so `clinic_plan_change` keeps
    // auditing only real plan changes.
    expect(clinic.plan).toBe("free");
    expect((await plans.getPlanLimits(ctx)).plan).toBe("free");
  });

  it("logs no plan change for the trial", async () => {
    await plans.getPlanLimits(ctx);
    const changes = await db
      .select()
      .from(schema.clinicPlanChange)
      .where(eq(schema.clinicPlanChange.clinicId, ctx.clinicId));
    expect(changes).toHaveLength(0);
  });
});

describe("expiry", () => {
  it("falls back to Free the moment the deadline passes — no job required", async () => {
    await setTrial(new Date(Date.now() - 1000));

    const limits = await plans.getPlanLimits(ctx);
    expect(limits.trialActive).toBe(false);
    expect(limits.effectivePlan).toBe("free");
    expect(limits.maxStudents).toBe(3);
    expect(limits.whatsapp).toBe(false);
    expect(limits.calendar).toBe(false);
  });

  it("is non-destructive: alunos added during the trial stay active", async () => {
    // Fill well past the Free cap of 3 while the trial is running.
    for (let i = 0; i < 6; i++) {
      await studentsDal.createStudent(ctx, {
        firstName: `Aluno${i}`,
        lastName: "Trial",
        modality: "online",
      });
    }
    expect(await studentsDal.countStudents(ctx)).toBe(6);

    await setTrial(new Date(Date.now() - 1000));

    // Over the cap now — but nothing was removed, and the roster still reads.
    expect(await plans.getStudentLimit(ctx)).toBe(3);
    expect(await studentsDal.countStudents(ctx)).toBe(6);
    const roster = await studentsDal.listStudents(ctx);
    expect(roster.filter((s) => s.status === "active")).toHaveLength(6);
  });

  it("a clinic that never had a trial is plain Free", async () => {
    await setTrial(null);

    const limits = await plans.getPlanLimits(ctx);
    expect(limits.trialActive).toBe(false);
    expect(limits.maxStudents).toBe(3);
  });
});

describe("paid plans", () => {
  it("ignores the trial once the clinic is on a paid plan", async () => {
    // A spent trial must not drag a paying clinic back down...
    await setPlan("clinica");
    await setTrial(new Date(Date.now() - 1000));

    let limits = await plans.getPlanLimits(ctx);
    expect(limits.trialActive).toBe(false);
    expect(limits.maxStudents).toBe(100);

    // ...nor should a still-running trial cap a Clínica at Solo's 50.
    await setTrial(inDays(7));
    limits = await plans.getPlanLimits(ctx);
    expect(limits.trialActive).toBe(false);
    expect(limits.effectivePlan).toBe("clinica");
    expect(limits.maxStudents).toBe(100);
  });

  it("lets a per-clinic override win over the trial", async () => {
    await db
      .update(schema.clinic)
      .set({ maxStudentsOverride: 5 })
      .where(eq(schema.clinic.id, ctx.clinicId));

    // An admin who capped this clinic meant it, trial or not.
    expect(await plans.getStudentLimit(ctx)).toBe(5);

    await db
      .update(schema.clinic)
      .set({ maxStudentsOverride: null })
      .where(eq(schema.clinic.id, ctx.clinicId));
  });
});
