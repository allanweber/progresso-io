import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";

import { db as defaultDb, schema } from "@/db";
import { sendOtpEmail, type SendOtp } from "@/lib/email";
import { ADMIN_ROLES, DEFAULT_ROLE } from "@/lib/roles";

/** OTP validity window, in seconds. */
const OTP_EXPIRES_IN = 60 * 10;

type CreateAuthOptions = {
  /** Drizzle client. Injectable so tests can run against an in-memory DB. */
  db?: Parameters<typeof drizzleAdapter>[0];
  /** OTP delivery. Injectable so tests can capture codes instead of sending. */
  sendOtp?: SendOtp;
  /**
   * Whether to attach the `nextCookies` plugin. Enabled in the app so cookies
   * flush from server actions; disabled in tests, which call `auth.api`
   * outside a Next.js request scope where `cookies()` is unavailable.
   */
  nextCookiesPlugin?: boolean;
};

/**
 * Builds a Better Auth instance. Kept as a factory so the same configuration
 * can be exercised in tests against a PGlite database and a capturing e-mail
 * sender, while production uses the shared postgres client and Resend.
 */
export function createAuth({
  db = defaultDb,
  sendOtp = sendOtpEmail,
  nextCookiesPlugin = true,
}: CreateAuthOptions = {}) {
  const googleConfigured =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

  const options = {
    appName: "Progresso IO",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Users must confirm the OTP before they can sign in.
      requireEmailVerification: true,
    },

    emailVerification: {
      // Confirming the account (OTP) signs the user in immediately.
      autoSignInAfterVerification: true,
    },

    // Enforce at most one OTP *generation* per minute, per the product rule.
    // Scoped to the code-sending endpoints only, so wrong-code retries on the
    // verify/reset endpoints stay governed by the plugin's `allowedAttempts`.
    // (Better Auth applies rate limiting in production by default.)
    rateLimit: {
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 1 },
        "/email-otp/request-password-reset": { window: 60, max: 1 },
        "/forget-password/email-otp": { window: 60, max: 1 },
      },
    },

    ...(googleConfigured
      ? {
          socialProviders: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID as string,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
          },
        }
      : {}),

    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_EXPIRES_IN,
        // Email a verification code automatically on sign-up, and route the
        // default email-verification flow through OTP.
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        // Wrong-code attempts before the OTP is invalidated.
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendOtp({ email, otp, type });
        },
      }),
      admin({
        defaultRole: DEFAULT_ROLE,
        adminRoles: ADMIN_ROLES,
      }),
      // `nextCookies` must be the LAST plugin so it can flush Set-Cookie
      // headers written by server actions.
      ...(nextCookiesPlugin ? [nextCookies()] : []),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
