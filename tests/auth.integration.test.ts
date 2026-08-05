// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { students as studentsDal } from "@/server/dal";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";
// Bootstrap admin e-mail consumed by createAuth's create-user hook.
process.env.ADMIN_EMAIL = "boss@example.com";

type Captured = { email: string; otp: string; type: string };

const captured: Captured[] = [];
let auth: ReturnType<typeof createAuth>;
let db: ReturnType<typeof drizzle>;

/** Most recent OTP sent to an address for a given flow. */
function latestOtp(email: string, type: string): string | undefined {
  return [...captured].reverse().find((c) => c.email === email && c.type === type)?.otp;
}

/** Turns a Response's Set-Cookie headers into a request `cookie` header. */
function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

beforeAll(async () => {
  const client = new PGlite();
  const dir = join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(dir, file), "utf8"));
  }
  db = drizzle(client, { schema, casing: "snake_case" });
  auth = createAuth({
    db,
    nextCookiesPlugin: false,
    sendOtp: async (message) => {
      captured.push(message);
    },
  });
});

const password = "supersegura123";
const coachEmail = "coach@example.com";

describe("sign-up + account confirmation (coach)", () => {
  it("creates an unverified coach and e-mails a verification OTP", async () => {
    await auth.api.signUpEmail({
      body: { name: "Thiago Corrêa", email: coachEmail, password },
    });

    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, coachEmail));

    expect(row.role).toBe("coach"); // default role
    expect(row.emailVerified).toBe(false);
    expect(latestOtp(coachEmail, "email-verification")).toMatch(/^\d{6}$/);
  });

  it("blocks sign-in until the account is confirmed", async () => {
    await expect(
      auth.api.signInEmail({ body: { email: coachEmail, password } }),
    ).rejects.toThrow();
  });

  it("confirms the OTP and verifies the user WITHOUT issuing a session", async () => {
    const otp = latestOtp(coachEmail, "email-verification")!;
    const res = await auth.api.verifyEmailOTP({
      body: { email: coachEmail, otp },
      asResponse: true,
    });
    expect(res.status).toBe(200);

    // autoSignInAfterVerification is off: verifying must NOT set a session
    // cookie — the user is sent to /login to sign in themselves.
    const cookie = cookieHeader(res);
    expect(cookie).not.toContain("session");

    // The e-mail is now verified in the database, even though no session exists.
    const [row] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, coachEmail));
    expect(row.emailVerified).toBe(true);
  });

  it("rejects a wrong OTP", async () => {
    await expect(
      auth.api.verifyEmailOTP({ body: { email: coachEmail, otp: "000000" } }),
    ).rejects.toThrow();
  });

  it("allows sign-in once verified", async () => {
    const result = await auth.api.signInEmail({
      body: { email: coachEmail, password },
    });
    expect(result.token).toBeTruthy();
  });
});

describe("password reset via OTP", () => {
  const newPassword = "novaSenha456";

  it("resets the password with the emailed code", async () => {
    await auth.api.forgetPasswordEmailOTP({ body: { email: coachEmail } });
    const otp = latestOtp(coachEmail, "forget-password");
    expect(otp).toMatch(/^\d{6}$/);

    await auth.api.resetPasswordEmailOTP({
      body: { email: coachEmail, otp: otp!, password: newPassword },
    });

    // Old password no longer works, new one does.
    await expect(
      auth.api.signInEmail({ body: { email: coachEmail, password } }),
    ).rejects.toThrow();
    const signedIn = await auth.api.signInEmail({
      body: { email: coachEmail, password: newPassword },
    });
    expect(signedIn.token).toBeTruthy();
  });
});

describe("clinic tenant bootstrap", () => {
  it("creates a clinic for the coach and sets clinicId at sign-up", async () => {
    const [coach] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, coachEmail));
    expect(coach.clinicId).toBeTruthy();

    const [clinic] = await db
      .select()
      .from(schema.clinic)
      .where(eq(schema.clinic.id, coach.clinicId!));
    expect(clinic.ownerUserId).toBe(coach.id);
    expect(clinic.name).toContain("Thiago");
  });

  it("gives the ADMIN_EMAIL sign-up the admin role and no clinic", async () => {
    await auth.api.signUpEmail({
      body: { name: "Super Admin", email: "boss@example.com", password },
    });
    const [admin] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "boss@example.com"));
    expect(admin.role).toBe("admin"); // from ADMIN_EMAIL
    expect(admin.clinicId).toBeNull(); // admins live outside any clinic
  });
});

describe("role scenario (coach / aluno / admin)", () => {
  it("keeps ordinary sign-ups as coach (with a clinic) and supports promoting to aluno", async () => {
    await auth.api.signUpEmail({
      body: { name: "Ana", email: "aluno@example.com", password },
    });
    const [before] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "aluno@example.com"));
    expect(before.role).toBe("coach");
    expect(before.clinicId).toBeTruthy();

    await db
      .update(schema.user)
      .set({ role: "aluno" })
      .where(eq(schema.user.email, "aluno@example.com"));
    const [after] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "aluno@example.com"));
    expect(after.role).toBe("aluno");
  });
});

describe("DAL tenant isolation", () => {
  it("scopes students to their clinic — no cross-tenant reads", async () => {
    // Clinic A = the coach's clinic.
    const [coachA] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, coachEmail));
    const ctxA = {
      db: db as unknown as DB,
      clinicId: coachA.clinicId!,
      userId: coachA.id,
      role: "coach" as const,
    };

    // Clinic B = a second coach's clinic.
    await auth.api.signUpEmail({
      body: { name: "Bruno Coach", email: "coachb@example.com", password },
    });
    const [coachB] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, "coachb@example.com"));
    const ctxB = {
      db: db as unknown as DB,
      clinicId: coachB.clinicId!,
      userId: coachB.id,
      role: "coach" as const,
    };

    await studentsDal.createStudent(ctxA, {
      firstName: "Aluno",
      lastName: "A",
      email: "a@example.com",
    });
    await studentsDal.createStudent(ctxB, {
      firstName: "Aluno",
      lastName: "B",
      email: "b@example.com",
    });

    const listA = await studentsDal.listStudents(ctxA);
    const listB = await studentsDal.listStudents(ctxB);

    // A sees only its own; B sees only its own.
    expect(listA.every((s) => s.clinicId === coachA.clinicId)).toBe(true);
    expect(listA.some((s) => s.email === "a@example.com")).toBe(true);
    expect(listA.some((s) => s.email === "b@example.com")).toBe(false);
    expect(listB.some((s) => s.email === "b@example.com")).toBe(true);
    expect(listB.some((s) => s.email === "a@example.com")).toBe(false);
  });
});
