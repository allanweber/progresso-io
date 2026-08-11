// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
// The address whose sign-up MAY be promoted to admin (only to bootstrap the first).
process.env.ADMIN_EMAIL = "chief@example.com";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("ADMIN_EMAIL bootstrap only elevates the first admin (L-3)", () => {
  it("promotes the ADMIN_EMAIL sign-up when no admin exists yet", async () => {
    await auth.api.signUpEmail({
      body: { name: "Chief", email: "chief@example.com", password },
    });
    const [chief] = await h
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "chief@example.com"));
    expect(chief.role).toBe("admin"); // first-ever admin, bootstrapped
  });

  it("does NOT elevate an ADMIN_EMAIL sign-up once an admin already exists", async () => {
    // A fresh DB where an admin already exists (created out-of-band, e.g. via an
    // in-app admin invitation): a later sign-up with the ADMIN_EMAIL address must
    // stay a plain coach — the env address can't be used to self-elevate anymore.
    const db2 = await createTestDb();
    const h2 = db2 as unknown as DB;
    const auth2 = createAuth({
      db: db2,
      nextCookiesPlugin: false,
      sendOtp: async () => {},
    });

    // Seed a pre-existing admin (sign up as a coach, then promote — mirrors the
    // invite-accept path that creates admins without touching ADMIN_EMAIL).
    await auth2.api.signUpEmail({
      body: { name: "First Admin", email: "first@example.com", password },
    });
    await db2
      .update(schema.user)
      .set({ role: "admin", clinicId: null })
      .where(eq(schema.user.email, "first@example.com"));

    // Now the ADMIN_EMAIL address signs up — an admin already exists.
    await auth2.api.signUpEmail({
      body: { name: "Chief Two", email: "chief@example.com", password },
    });
    const [chief] = await h2
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "chief@example.com"));
    expect(chief.role).toBe("coach"); // NOT promoted — squatting blocked
  });
});
