// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { coachInvitations, coaches, plans, students as studentsDal } from "@/server/dal";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

/** Signs up a coach (bootstraps their clinic) and returns an owner context. */
async function ownerContext(
  email: string,
  name: string,
  plan: schema.Plan,
): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name, email, password } });
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

/** Signs up a user then attaches them as a coach of an existing clinic. */
async function addCoach(
  email: string,
  name: string,
  clinicId: string,
): Promise<string> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.user)
    .set({ role: "coach", clinicId })
    .where(eq(schema.user.id, user.id));
  await db.delete(schema.clinic).where(eq(schema.clinic.ownerUserId, user.id));
  return user.id;
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });

  await db.insert(schema.planLimit).values([
    { plan: "free", maxStudents: 3, maxCoaches: 1, whatsapp: false },
    { plan: "solo", maxStudents: 50, maxCoaches: 1, whatsapp: true },
    { plan: "clinica", maxStudents: 100, maxCoaches: 3, whatsapp: true },
    { plan: "enterprise", maxStudents: null, maxCoaches: null, whatsapp: true },
  ]);
});

describe("plan limits (coach cap + WhatsApp gate)", () => {
  it("reads the full plan capabilities for the tenant", async () => {
    const owner = await ownerContext("limits@example.com", "Owner", "clinica");
    const limits = await plans.getPlanLimits(owner);
    expect(limits).toEqual({ maxStudents: 100, maxCoaches: 3, whatsapp: true });
    expect(await plans.getCoachLimit(owner)).toBe(3);
    expect(await plans.canUseWhatsapp(owner)).toBe(true);
  });

  it("disables WhatsApp on the free plan", async () => {
    const free = await ownerContext("free@example.com", "Free Owner", "free");
    expect(await plans.canUseWhatsapp(free)).toBe(false);
    expect(await plans.getCoachLimit(free)).toBe(1);
  });
});

describe("coach team (roster + ownership + removal)", () => {
  it("lists coaches owner-first with per-coach active aluno counts", async () => {
    const owner = await ownerContext("team@example.com", "Thiago Corrêa", "clinica");
    const coach2 = await addCoach("bianca@example.com", "Bianca Reis", owner.clinicId);

    // 2 alunos for Bianca (one archived → excluded), 1 for the owner.
    await studentsDal.createStudent(owner, {
      firstName: "A", lastName: "Um", coachId: coach2,
    });
    const archived = await studentsDal.createStudent(owner, {
      firstName: "B", lastName: "Dois", coachId: coach2,
    });
    await db
      .update(schema.students)
      .set({ status: "archived" })
      .where(eq(schema.students.id, archived.id));
    await studentsDal.createStudent(owner, {
      firstName: "C", lastName: "Três", coachId: owner.userId,
    });

    expect(await coaches.isClinicOwner(owner)).toBe(true);
    expect(await coaches.countActiveCoaches(owner)).toBe(2);

    const list = await coaches.listClinicCoaches(owner);
    expect(list.map((c) => c.name)).toEqual(["Thiago Corrêa", "Bianca Reis"]);
    expect(list[0]).toMatchObject({ isOwner: true, studentCount: 1 });
    expect(list[1]).toMatchObject({ isOwner: false, studentCount: 1 }); // archived excluded
  });

  it("removing a coach transfers alunos to the owner and deletes the account", async () => {
    const owner = await ownerContext("rm@example.com", "Owner", "clinica");
    const coach2 = await addCoach("rm-coach@example.com", "Coach Two", owner.clinicId);
    const s = await studentsDal.createStudent(owner, {
      firstName: "Aluno", lastName: "X", coachId: coach2,
    });

    const result = await coaches.removeCoach(owner, coach2);
    expect(result.ok).toBe(true);

    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, coach2));
    expect(user).toBeUndefined(); // hard-deleted

    const [moved] = await db
      .select({ coachId: schema.students.coachId })
      .from(schema.students)
      .where(eq(schema.students.id, s.id));
    expect(moved.coachId).toBe(owner.userId); // transferred to the owner
  });

  it("protects the owner, the acting user, and other clinics", async () => {
    const owner = await ownerContext("guard@example.com", "Owner", "clinica");
    const coach2 = await addCoach("guard-2@example.com", "Two", owner.clinicId);
    const other = await ownerContext("guard-other@example.com", "Other", "clinica");

    expect((await coaches.removeCoach(owner, owner.userId)).ok).toBe(false); // is_owner
    // A non-owner coach can't remove itself.
    const coach2Ctx: TenantContext = { ...owner, userId: coach2 };
    const self = await coaches.removeCoach(coach2Ctx, coach2);
    expect(self).toEqual({ ok: false, reason: "is_self" });
    // Cross-clinic: the other clinic's owner isn't a coach here.
    const cross = await coaches.removeCoach(owner, other.userId);
    expect(cross).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("coach invitations", () => {
  it("creates, counts, supersedes and revokes a pending invite", async () => {
    const owner = await ownerContext("inv@example.com", "Owner", "clinica");
    const [clinic] = await db
      .select()
      .from(schema.clinic)
      .where(eq(schema.clinic.id, owner.clinicId));

    const { rawToken } = await coachInvitations.createCoachInvitation(owner, {
      email: "New@Example.com",
      name: "New Coach",
    });
    expect(await coachInvitations.countPendingInvites(owner)).toBe(1);
    expect(await coachInvitations.hasPendingInvite(owner, "new@example.com")).toBe(true);

    // The token resolves to the invite + the clinic it joins.
    const found = await coachInvitations.findPendingByToken(h, rawToken);
    expect(found?.invitation.email).toBe("new@example.com");
    expect(found?.clinic.name).toBe(clinic.name);
    expect(await coachInvitations.findPendingByToken(h, "garbage")).toBeNull();

    // Re-inviting the same e-mail supersedes — still exactly one pending.
    await coachInvitations.createCoachInvitation(owner, {
      email: "new@example.com",
      name: "New Coach",
    });
    expect(await coachInvitations.countPendingInvites(owner)).toBe(1);

    const [live] = await coachInvitations.listPendingInvites(owner);
    expect(await coachInvitations.revokeInvite(owner, live.id)).toBe(true);
    expect(await coachInvitations.countPendingInvites(owner)).toBe(0);
  });

  it("scopes invite listing + revoke to the clinic", async () => {
    const a = await ownerContext("scope-a@example.com", "A", "clinica");
    const b = await ownerContext("scope-b@example.com", "B", "clinica");
    await coachInvitations.createCoachInvitation(a, { email: "x@a.com", name: "X" });

    // B can't see or revoke A's invite.
    expect(await coachInvitations.countPendingInvites(b)).toBe(0);
    const [aInvite] = await coachInvitations.listPendingInvites(a);
    expect(await coachInvitations.revokeInvite(b, aInvite.id)).toBe(false);
    expect(await coachInvitations.countPendingInvites(a)).toBe(1);
  });
});
