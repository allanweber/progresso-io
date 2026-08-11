import { AsyncLocalStorage } from "node:async_hooks";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";

import { db as defaultDb, schema, type DB } from "@/db";
import { sendOtpEmail, type SendOtp } from "@/lib/email";
import {
  ADMIN_ROLES,
  DEFAULT_ROLE,
  bootstrapAdminEmail,
  isAdminEmail,
} from "@/lib/roles";
import { attachUserToClinic, createClinicForOwner } from "@/server/dal/clinics";

/** OTP validity window, in seconds. */
const OTP_EXPIRES_IN = 60 * 10;

/**
 * Set for the async context of a token-based account activation (aluno invite /
 * admin invite accept). Those flows create the login with `signUpEmail` and
 * then force `emailVerified: true` themselves — the invite token already proves
 * the address — so Better Auth's automatic "verification OTP on sign-up" would
 * e-mail the user a code they never need. When this store is active, that
 * verification send is skipped. Coach self sign-up (/register) and
 * password-reset are unaffected and still send normally.
 */
const suppressVerificationEmail = new AsyncLocalStorage<true>();

/**
 * Runs `fn` with the sign-up verification OTP suppressed — wrap the
 * `auth.api.signUpEmail` call in the invite/admin accept routes.
 */
export function withoutVerificationEmail<T>(fn: () => Promise<T>): Promise<T> {
  return suppressVerificationEmail.run(true, fn);
}

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

  // Session tokens are signed with this secret; an unset/weak one makes sessions
  // forgeable. Fail fast at RUNTIME in production rather than degrade silently
  // (mirrors the DATABASE_URL guard in src/db/index.ts). Dev/test keep any value.
  //
  // The check is skipped during `next build`: the build runs with
  // NODE_ENV=production but the secret is a runtime-only env (set in the deploy
  // environment, never a build arg), so asserting here would break the build's
  // page-data collection. NEXT_PHASE is "phase-production-build" only while
  // building; at runtime (`node server.js`) it's unset, so the guard still fires.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    (!secret || secret.length < 32)
  ) {
    throw new Error(
      "BETTER_AUTH_SECRET is missing or too short (need at least 32 chars) in production.",
    );
  }

  // Admins aren't self-selectable: the single sign-up whose e-mail matches
  // ADMIN_EMAIL is promoted to admin; everyone else defaults to coach.
  const adminEmail = bootstrapAdminEmail(process.env.ADMIN_EMAIL);

  // The injected adapter db, typed for the Data Access Layer (used by the
  // clinic-bootstrap hook below).
  const database = db as unknown as DB;

  const options = {
    appName: "Progresso IO",
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

    // Pin cookie/session/origin defaults instead of relying on inferred ones.
    // Only the canonical production origin is trusted for CSRF/redirects; secure
    // cookies are forced in production (they're http-only, sameSite=lax already).
    ...(process.env.BETTER_AUTH_URL
      ? { trustedOrigins: [process.env.BETTER_AUTH_URL] }
      : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7-day session
      updateAge: 60 * 60 * 24, // refresh the token at most once a day
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
    },

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
      // Confirming the account (OTP) verifies the e-mail ONLY — it never signs
      // the user in and never establishes a session cookie. After verifying,
      // the user is sent to /login to sign in themselves.
      autoSignInAfterVerification: false,
    },

    user: {
      additionalFields: {
        // The tenant the user belongs to. Managed by the app (the clinic
        // bootstrap below), never set from client input.
        clinicId: { type: "string", required: false, input: false },
      },
    },

    databaseHooks: {
      user: {
        create: {
          // Grant the admin role at sign-up when the e-mail matches the single
          // ADMIN_EMAIL — but ONLY to bootstrap the very first admin. Once any
          // admin exists, that address no longer auto-elevates (further admins
          // come from in-app invitations), so an attacker who pre-registers the
          // ADMIN_EMAIL can't silently gain admin. Ordinary sign-ups stay coach.
          before: async (user) => {
            if (isAdminEmail(user.email, adminEmail)) {
              const [{ n }] = await database
                .select({ n: count() })
                .from(schema.user)
                .where(eq(schema.user.role, "admin"));
              if (n === 0) return { data: { ...user, role: "admin" } };
            }
          },
          // Every coach sign-up (email or Google) gets its own clinic — a solo
          // coach still owns a one-member clinic. Admins have no clinic; an
          // already-attached user (e.g. an invited aluno) is left alone.
          after: async (createdUser) => {
            const u = createdUser as {
              id: string;
              name?: string;
              role?: string;
              clinicId?: string | null;
            };
            if (u.role === "admin" || u.clinicId) return;
            const firstName = u.name?.trim().split(" ")[0] || "Minha";
            const clinic = await createClinicForOwner(database, {
              ownerUserId: u.id,
              name: `Clínica de ${firstName}`,
            });
            await attachUserToClinic(database, u.id, clinic.id);
            // Give the new clinic its own copy of the starter anamneses; it owns
            // and edits them freely from here on.
            const { seedClinicAnamneses } = await import(
              "@/server/dal/anamneses"
            );
            await seedClinicAnamneses(database, clinic.id, u.id);
          },
        },
      },
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
          // Skip the sign-up verification e-mail during a token-based account
          // activation (invite accept), which force-verifies the address itself.
          // Only the "email-verification" send is suppressed — a sign-in or
          // password-reset OTP is never affected.
          if (
            type === "email-verification" &&
            suppressVerificationEmail.getStore()
          ) {
            return;
          }
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
