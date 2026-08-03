// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

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

  it("confirms the OTP, verifies the user and issues a session", async () => {
    const otp = latestOtp(coachEmail, "email-verification")!;
    const res = await auth.api.verifyEmailOTP({
      body: { email: coachEmail, otp },
      asResponse: true,
    });
    expect(res.status).toBe(200);

    const cookie = cookieHeader(res);
    expect(cookie).toContain("session");

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.email).toBe(coachEmail);
    expect(session?.user.role).toBe("coach");
    expect(session?.user.emailVerified).toBe(true);
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

describe("role scenario (coach / aluno / admin)", () => {
  it("supports promoting users to the aluno and admin roles", async () => {
    for (const [email, role] of [
      ["aluno@example.com", "aluno"],
      ["admin@example.com", "admin"],
    ] as const) {
      await auth.api.signUpEmail({ body: { name: role, email, password } });
      await db
        .update(schema.user)
        .set({ role })
        .where(eq(schema.user.email, email));
      const [row] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, email));
      expect(row.role).toBe(role);
    }
  });

  it("links alunos to their coach", async () => {
    const [coach] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, coachEmail));

    await db.insert(schema.students).values({
      coachId: coach.id,
      name: "Aluno de Teste",
      email: "aluno.vinculado@example.com",
    });

    const students = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.coachId, coach.id));
    expect(students).toHaveLength(1);
    expect(students[0].coachId).toBe(coach.id);
  });
});
