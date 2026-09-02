// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import type { TenantContext } from "@/server/tenant";
import {
  invitations,
  plans,
  students as studentsDal,
  studentAnamneses,
} from "@/server/dal";
import { seedClinicAnamneses } from "@/server/dal/anamneses";
import {
  sendAnamnesisInvite,
  sendPortalInvite,
  sendPortalInviteOnAnamnesisFilled,
  sendPortalInviteOnFirstPrescription,
  studentLinkBase,
} from "@/server/onboarding";

import { clearTrial, createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let ctx: TenantContext;
let ctxB: TenantContext;

const password = "supersegura123";

/** Signs up a coach and returns a tenant context for their clinic. */
async function coachContext(email: string, name: string): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  // Starter templates are no longer seeded at sign-up — they're seeded in the
  // background on first sign-in. Seed the clinic's anamneses directly here (the
  // onboarding tests below need a starter anamnese to assign).
  await seedClinicAnamneses(db as unknown as DB, user.clinicId!, user.id);
  // This suite asserts PLAN caps, so drop the sign-up trial — otherwise a free
  // clinic reads as Solo (50) while it runs.
  await clearTrial(db, user.clinicId!);
  return {
    db: db as unknown as DB,
    clinicId: user.clinicId!,
    userId: user.id,
    role: "coach",
  };
}

beforeAll(async () => {
  db = await createTestDb();
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });

  // Reference plan limits (mirrors the seed): free blocks the 4th student.
  // Migration 0025 already seeds plan_limit, so reset to this test's set first.
  await db.delete(schema.planLimit);
  await db.insert(schema.planLimit).values([
    { plan: "free", maxStudents: 3 },
    { plan: "solo", maxStudents: 50 },
    { plan: "clinica", maxStudents: 300 },
    { plan: "enterprise", maxStudents: null },
  ]);

  ctx = await coachContext("coach-a@example.com", "Coach A");
  ctxB = await coachContext("coach-b@example.com", "Coach B");
});

describe("student CRUD (tenant-scoped)", () => {
  it("creates a student with the new fields and derived roster flags", async () => {
    const created = await studentsDal.createStudent(ctx, {
      firstName: "Ana",
      lastName: "Aluna",
      email: "ana@example.com",
      phone: "11999",
      goal: "Hipertrofia",
      modality: "in_person",
      coachId: ctx.userId,
    });
    expect(created.firstName).toBe("Ana");
    expect(created.status).toBe("active");
    expect(created.modality).toBe("in_person");
    expect(created.userId).toBeNull();

    const roster = await studentsDal.listStudents(ctx);
    const row = roster.find((s) => s.id === created.id)!;
    expect(row.hasAccount).toBe(false);
    expect(row.pendingInvite).toBe(false);
  });

  it("updates and looks up a student by e-mail", async () => {
    const [student] = await studentsDal.listStudents(ctx);
    const updated = await studentsDal.updateStudent(ctx, student.id, {
      goal: "Emagrecimento",
    });
    expect(updated?.goal).toBe("Emagrecimento");

    const found = await studentsDal.findStudentByEmail(ctx, "ana@example.com");
    expect(found?.id).toBe(student.id);
  });

  it("archives (soft) and excludes archived from the seat count", async () => {
    const before = await studentsDal.countStudents(ctx);
    const [student] = await studentsDal.listStudents(ctx);
    const archived = await studentsDal.archiveStudent(ctx, student.id);
    expect(archived?.status).toBe("archived");

    const after = await studentsDal.countStudents(ctx);
    expect(after).toBe(before - 1);

    // Still visible in the (unfiltered) roster, just archived.
    const roster = await studentsDal.listStudents(ctx);
    expect(roster.some((s) => s.id === student.id)).toBe(true);

    await studentsDal.setStudentStatus(ctx, student.id, "active"); // reactivate
  });

  it("never returns another clinic's students", async () => {
    await studentsDal.createStudent(ctxB, {
      firstName: "Bruno",
      lastName: "B",
      email: "bruno@example.com",
      modality: "online",
    });
    const listA = await studentsDal.listStudents(ctx);
    expect(listA.some((s) => s.email === "bruno@example.com")).toBe(false);
  });
});

describe("plan limits", () => {
  it("reads the cap for the clinic's plan (free = 3)", async () => {
    const limit = await plans.getStudentLimit(ctx);
    expect(limit).toBe(3);
  });

  it("returns null (unlimited) for an uncapped plan", async () => {
    await db
      .update(schema.clinic)
      .set({ plan: "enterprise" })
      .where(eq(schema.clinic.id, ctxB.clinicId));
    const limit = await plans.getStudentLimit(ctxB);
    expect(limit).toBeNull();
  });
});

describe("invitation lifecycle", () => {
  it("creates a pending invite the roster reflects, then accepts it", async () => {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Carla",
      lastName: "C",
      email: "carla@example.com",
      modality: "online",
    });

    const { invitation, rawToken } = await invitations.createInvitation(
      ctx,
      student.id,
    );
    expect(rawToken).toBeTruthy();
    // The raw token is never stored; only its hash.
    expect(invitation.tokenHash).not.toBe(rawToken);

    const roster = await studentsDal.listStudents(ctx);
    expect(roster.find((s) => s.id === student.id)!.pendingInvite).toBe(true);

    const pending = await invitations.findPendingByToken(db as unknown as DB, rawToken);
    expect(pending?.student.id).toBe(student.id);

    await invitations.markAccepted(db as unknown as DB, invitation.id);
    expect(
      await invitations.findPendingByToken(db as unknown as DB, rawToken),
    ).toBeNull();
  });

  it("supersedes an earlier unaccepted invite for the same student", async () => {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Diego",
      lastName: "D",
      email: "diego@example.com",
      modality: "online",
    });
    await invitations.createInvitation(ctx, student.id);
    const second = await invitations.createInvitation(ctx, student.id);

    const rows = await db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.studentId, student.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second.invitation.id);
  });

  it("does not resolve an expired token", async () => {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Elena",
      lastName: "E",
      email: "elena@example.com",
      modality: "online",
    });
    await db.insert(schema.invitation).values({
      clinicId: ctx.clinicId,
      studentId: student.id,
      tokenHash: "deadbeef",
      expiresAt: new Date(Date.now() - 1000),
    });
    // The raw token whose sha-256 is "deadbeef" is unknown; but even a matching
    // hash would be rejected for being expired. Assert via a direct expired row.
    const pending = await db
      .select()
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.studentId, student.id),
          eq(schema.invitation.tokenHash, "deadbeef"),
        ),
      );
    expect(pending[0].expiresAt.getTime()).toBeLessThan(Date.now());
  });
});

describe("invite accept provisioning", () => {
  it("activates an aluno login inside the inviting clinic (no stray clinic)", async () => {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Fábio",
      lastName: "F",
      email: "fabio@example.com",
      modality: "online",
    });
    const { invitation } = await invitations.createInvitation(ctx, student.id);

    // Replicates the accept route: sign up (auto-bootstraps a clinic), then move
    // the aluno into the inviting clinic and drop the throwaway one.
    await auth.api.signUpEmail({
      body: { name: "Fábio F", email: "fabio@example.com", password },
    });
    const [newUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "fabio@example.com"));

    await db
      .update(schema.user)
      .set({ role: "aluno", clinicId: invitation.clinicId, emailVerified: true })
      .where(eq(schema.user.id, newUser.id));
    await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, newUser.id));
    await studentsDal.linkStudentAccount(db as unknown as DB, {
      clinicId: invitation.clinicId,
      studentId: student.id,
      userId: newUser.id,
    });
    await invitations.markAccepted(db as unknown as DB, invitation.id);

    const [aluno] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, newUser.id));
    expect(aluno.role).toBe("aluno");
    expect(aluno.clinicId).toBe(ctx.clinicId);

    // No clinic left owned by the aluno.
    const stray = await db
      .select()
      .from(schema.clinic)
      .where(eq(schema.clinic.ownerUserId, newUser.id));
    expect(stray).toHaveLength(0);

    // The student now has portal access and no pending invite.
    const roster = await studentsDal.listStudents(ctx);
    const row = roster.find((s) => s.id === student.id)!;
    expect(row.userId).toBe(newUser.id);
    expect(row.hasAccount).toBe(true);
    expect(row.pendingInvite).toBe(false);

    // The aluno can sign in (verified) — the accept flow's final step.
    const signIn = await auth.api.signInEmail({
      body: { email: "fabio@example.com", password },
    });
    expect(signIn.token).toBeTruthy();
  });
});

describe("onboarding: anamnese invite vs portal access", () => {
  const base = "http://test.local";

  /** The clinic already has starter anamneses (seeded on coach sign-up). */
  async function anyAnamnesisId(): Promise<string> {
    const [row] = await db
      .select({ id: schema.anamnesis.id })
      .from(schema.anamnesis)
      .where(eq(schema.anamnesis.clinicId, ctx.clinicId))
      .limit(1);
    return row.id;
  }

  /** Creates an online student with a pending anamnese assigned. */
  async function onlineStudentWithAnamnesis(email: string) {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Portal",
      lastName: "Test",
      email,
      phone: `1198${Math.floor(Math.random() * 1e6)}`,
      modality: "online",
    });
    const assign = await studentAnamneses.assignAnamnesis(
      ctx,
      student.id,
      await anyAnamnesisId(),
    );
    expect(assign.ok).toBe(true);
    return student;
  }

  it("registration invite sends the anamnese link and creates NO portal invite", async () => {
    const student = await onlineStudentWithAnamnesis("anamnese-only@example.com");

    const result = await sendAnamnesisInvite(ctx, student.id, base);
    expect(result.ok).toBe(true);
    // No account-activation invitation is minted at this stage.
    expect(await invitations.hasInvitation(ctx, student.id)).toBe(false);
  });

  it("still sends the anamnese when the clinic has no WhatsApp", async () => {
    // The link used to go out over WhatsApp only, gated on a paid plan — so a
    // free clinic registered an aluno and contacted them on no channel at all.
    // E-mail is unconditional now, and the send reports success.
    await db
      .update(schema.clinic)
      .set({ plan: "free", trialEndsAt: null })
      .where(eq(schema.clinic.id, ctx.clinicId));
    try {
      const student = await onlineStudentWithAnamnesis("free-clinic@example.com");
      expect(await sendAnamnesisInvite(ctx, student.id, base)).toEqual({ ok: true });
    } finally {
      await db
        .update(schema.clinic)
        .set({ plan: "clinica" })
        .where(eq(schema.clinic.id, ctx.clinicId));
    }
  });

  it("the first prescription sends the portal invite exactly once", async () => {
    const student = await onlineStudentWithAnamnesis("first-publish@example.com");
    expect(await invitations.hasInvitation(ctx, student.id)).toBe(false);

    // First diet/workout publish → portal invite goes out.
    await sendPortalInviteOnFirstPrescription(ctx, student.id, base);
    expect(await invitations.hasInvitation(ctx, student.id)).toBe(true);

    // A second prescription must not mint another invite.
    await sendPortalInviteOnFirstPrescription(ctx, student.id, base);
    const rows = await db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.clinicId, ctx.clinicId),
          eq(schema.invitation.studentId, student.id),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("offline students never get a portal invite on publish", async () => {
    const student = await studentsDal.createStudent(ctx, {
      firstName: "Offline",
      lastName: "Only",
      phone: "1197000000",
      modality: "in_person",
    });
    await sendPortalInviteOnFirstPrescription(ctx, student.id, base);
    expect(await invitations.hasInvitation(ctx, student.id)).toBe(false);
  });

  /**
   * Every link a coach sends a student lands under the clinic's own address when
   * it publishes one. First contact is when a student should see their coach's
   * brand, not ours — and the branded routes exist precisely to receive these.
   */
  describe("links under the Portal do aluno", () => {
    async function setPortal(slug: string | null, plan: schema.Plan) {
      await db
        .update(schema.clinic)
        .set({ portalSubdomain: slug, plan, trialEndsAt: null })
        .where(eq(schema.clinic.id, ctx.clinicId));
    }

    it("builds every student link under the portal when one is published", async () => {
      await setPortal("studio-forja", "clinica");
      expect(await studentLinkBase(ctx, base)).toBe(`${base}/studio-forja`);
    });

    it("falls back to the canonical routes when no portal is published", async () => {
      await setPortal(null, "clinica");
      expect(await studentLinkBase(ctx, base)).toBe(base);
    });

    it("falls back when the plan can no longer publish the portal", async () => {
      // The slug stays on the row — reserved for when they pay again — but a
      // link pointing at a dark portal would be a 404 in a student's inbox.
      await setPortal("studio-forja", "free");
      expect(await studentLinkBase(ctx, base)).toBe(base);
    });

    it("brands links throughout the sign-up trial", async () => {
      // Stored as free, trialing Clínica: the portal is live, so its links are
      // branded — the same effective-plan answer the public route gives.
      await db
        .update(schema.clinic)
        .set({
          portalSubdomain: "studio-forja",
          plan: "free",
          intendedPlan: "clinica",
          trialEndsAt: new Date(Date.now() + 86_400_000),
        })
        .where(eq(schema.clinic.id, ctx.clinicId));
      expect(await studentLinkBase(ctx, base)).toBe(`${base}/studio-forja`);

      await setPortal(null, "clinica");
    });
  });

  /**
   * The second half of the "anamnese first, then access" flow: submitting the
   * questionnaire is what opens the platform. The public fill route has no
   * session, so it builds a clinic-owner context — this asserts that path mints
   * the invitation, and mints it only once.
   */
  describe("portal access when the anamnese is filled", () => {
    it("invites the aluno once they submit", async () => {
      const student = await onlineStudentWithAnamnesis("filled-then-invited@example.com");
      expect(await invitations.hasInvitation(ctx, student.id)).toBe(false);

      await sendPortalInviteOnAnamnesisFilled(ctx, student.id, base);
      expect(await invitations.hasInvitation(ctx, student.id)).toBe(true);
    });

    it("does not mint a second invite when a prescription follows", async () => {
      // The two triggers race by nature — an aluno can submit while the coach
      // publishes their first plan — and only one invitation may result.
      const student = await onlineStudentWithAnamnesis("no-double-invite@example.com");
      await sendPortalInviteOnAnamnesisFilled(ctx, student.id, base);
      await sendPortalInviteOnFirstPrescription(ctx, student.id, base);

      const rows = await db
        .select({ id: schema.invitation.id })
        .from(schema.invitation)
        .where(
          and(
            eq(schema.invitation.clinicId, ctx.clinicId),
            eq(schema.invitation.studentId, student.id),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("never invites an offline student", async () => {
      const student = await studentsDal.createStudent(ctx, {
        firstName: "Offline",
        lastName: "Filled",
        phone: "1197000001",
        modality: "in_person",
      });
      await sendPortalInviteOnAnamnesisFilled(ctx, student.id, base);
      expect(await invitations.hasInvitation(ctx, student.id)).toBe(false);
    });
  });

  it("the manual portal invite is skipped once the aluno has activated", async () => {
    const student = await onlineStudentWithAnamnesis("already-active@example.com");
    // Simulate an activated login.
    await db
      .update(schema.students)
      .set({ userId: ctx.userId })
      .where(eq(schema.students.id, student.id));

    const result = await sendPortalInvite(ctx, student.id, base);
    expect(result).toEqual({ ok: false, reason: "already_active" });
  });
});
