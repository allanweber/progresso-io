// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { admin, adminInvitations } from "@/server/dal";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
// The bootstrap admin: a sign-up with this e-mail is promoted to admin (no clinic).
process.env.ADMIN_EMAIL = "boss@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("admin invitations DAL", () => {
  it("creates an invite, supersedes a prior one, and resolves by token", async () => {
    const first = await adminInvitations.createAdminInvitation(h, {
      email: "New@Example.com",
      name: "New Admin",
      invitedByUserId: null,
    });
    expect(first.rawToken).toBeTruthy();
    // Stored normalized (lowercased).
    expect(first.invitation.email).toBe("new@example.com");

    const second = await adminInvitations.createAdminInvitation(h, {
      email: "new@example.com",
      name: "New Admin",
      invitedByUserId: null,
    });

    // Only one live invite for the e-mail — the first token no longer resolves.
    const pending = await adminInvitations.listPendingInvites(h);
    expect(pending.filter((p) => p.email === "new@example.com")).toHaveLength(1);
    expect(await adminInvitations.findPendingByToken(h, first.rawToken)).toBeNull();

    const resolved = await adminInvitations.findPendingByToken(h, second.rawToken);
    expect(resolved?.email).toBe("new@example.com");
    expect(await adminInvitations.hasPendingInvite(h, "new@example.com")).toBe(true);
  });

  it("revokes a pending invite", async () => {
    const { invitation } = await adminInvitations.createAdminInvitation(h, {
      email: "revoke@example.com",
      name: "Revoke Me",
      invitedByUserId: null,
    });
    expect(await adminInvitations.revokeInvite(h, invitation.id)).toBe(true);
    expect(await adminInvitations.hasPendingInvite(h, "revoke@example.com")).toBe(
      false,
    );
    // A second revoke is a no-op.
    expect(await adminInvitations.revokeInvite(h, invitation.id)).toBe(false);
  });

  it("marks an invite accepted (drops it from pending)", async () => {
    const { invitation, rawToken } = await adminInvitations.createAdminInvitation(
      h,
      { email: "accept@example.com", name: "Accept Me", invitedByUserId: null },
    );
    await adminInvitations.markAccepted(h, invitation.id);
    expect(await adminInvitations.findPendingByToken(h, rawToken)).toBeNull();
    expect(await adminInvitations.hasPendingInvite(h, "accept@example.com")).toBe(
      false,
    );
  });
});

describe("admin users DAL", () => {
  it("lists/counts admins and deleteAdminUser only removes admins", async () => {
    // Bootstrap admin (ADMIN_EMAIL) — promoted at sign-up, owns no clinic.
    await auth.api.signUpEmail({
      body: { name: "Boss Admin", email: "boss@example.com", password },
    });
    // A coach — role "coach", owns a clinic.
    await auth.api.signUpEmail({
      body: { name: "Coach One", email: "coach1@example.com", password },
    });

    const admins = await admin.listAdmins(h);
    expect(admins.map((a) => a.email)).toContain("boss@example.com");
    expect(admins.map((a) => a.email)).not.toContain("coach1@example.com");
    expect(await admin.countAdmins(h)).toBe(admins.length);

    // getUserByEmail is case-insensitive and reports the role.
    expect((await admin.getUserByEmail(h, "COACH1@example.com"))?.role).toBe(
      "coach",
    );

    // deleteAdminUser refuses to remove a non-admin (a coach stays put).
    const coach = await admin.getUserByEmail(h, "coach1@example.com");
    expect(await admin.deleteAdminUser(h, coach!.id)).toBe(false);
    expect(await admin.getUserByEmail(h, "coach1@example.com")).not.toBeNull();
  });

  it("hard-deletes an admin (and their clinic-less account cleanly)", async () => {
    // Simulate the accept flow: sign up, promote to admin, drop the throwaway clinic.
    await auth.api.signUpEmail({
      body: { name: "Second Admin", email: "second@example.com", password },
    });
    const second = await admin.getUserByEmail(h, "second@example.com");
    await db
      .update(schema.user)
      .set({ role: "admin", clinicId: null })
      .where(eq(schema.user.id, second!.id));
    await db
      .delete(schema.clinic)
      .where(eq(schema.clinic.ownerUserId, second!.id));

    const before = await admin.countAdmins(h);
    expect(await admin.deleteAdminUser(h, second!.id)).toBe(true);
    expect(await admin.countAdmins(h)).toBe(before - 1);
    expect(await admin.getUserById(h, second!.id)).toBeNull();
  });
});
