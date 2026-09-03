"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth, withSignUpPlan } from "@/lib/auth";
import { SIGNUP_PLAN_IDS } from "@/lib/plans";
import { homePathForRole } from "@/lib/roles";
import { logger, withAction } from "@/server/observability";
import { clientIp, hit } from "@/server/rate-limit";
import { type FieldErrors, parseForm, z } from "@/lib/validation";

/** A minute and an hour, in ms — the windows the auth limiter uses. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Friendly PT-BR "slow down" banner reused by every throttled auth action. */
const TOO_MANY: ActionState = {
  formError: "Muitas tentativas. Aguarde um instante e tente de novo.",
};

/**
 * Result returned to client forms. Actions that finish the flow `redirect()`
 * (so they never return). Otherwise:
 * - `fieldErrors` — messages shown under specific inputs.
 * - `formError` — a banner message for errors not tied to a single field.
 * - `ok` — success while staying on the page.
 *
 * Every action is wrapped with `withAction`, which opens a request context and,
 * on a genuine throw, reports it to Sentry + `console.error` (Next's
 * redirect()/notFound() control-flow signals propagate untouched, never as
 * errors). Business events (signups, sign-ins, resets) are logged explicitly at
 * their decision points — never with the e-mail or any credential.
 */
export type ActionState =
  | { formError?: string; fieldErrors?: FieldErrors; ok?: boolean }
  | undefined;

/* --------------------------- validation schemas --------------------------- */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Digite o código de 6 dígitos.");

const newPasswordSchema = z
  .string()
  .min(8, "A senha deve ter no mínimo 8 caracteres.");

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo."),
  email: emailSchema,
  password: newPasswordSchema,
  // The plan chosen in the wizard. Only the self-selectable plans are accepted
  // (never `enterprise`); a missing/unknown value falls back to `free` so a
  // malformed request never grants a paid plan.
  plan: z.enum(SIGNUP_PLAN_IDS).catch("free"),
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
  // "Continuar conectado". A checkbox sends "on" when ticked and nothing at
  // all when not, so absence IS the answer — anything else is treated as
  // unticked rather than rejected, since a malformed value must never be the
  // reason someone can't sign in.
  rememberMe: z.literal("on").optional(),
});

const verifySchema = z.object({ email: emailSchema, otp: otpSchema });

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  password: newPasswordSchema,
});

/** The Better Auth error code, when the failure is an APIError. */
function errorCode(error: unknown): string | undefined {
  return error instanceof APIError
    ? (error.body?.code as string | undefined)
    : undefined;
}

/**
 * Maps a Better Auth error to an {@link ActionState}, routing field-specific
 * failures to the relevant input and everything else to the banner.
 */
function authError(error: unknown): ActionState {
  if (error instanceof APIError) {
    const code = (error.body?.code as string | undefined) ?? "";
    switch (code) {
      case "USER_ALREADY_EXISTS":
        return { fieldErrors: { email: "Já existe uma conta com este e-mail." } };
      case "INVALID_OTP":
        return { fieldErrors: { otp: "Código inválido. Verifique e tente novamente." } };
      case "OTP_EXPIRED":
        return { fieldErrors: { otp: "O código expirou. Solicite um novo." } };
      case "INVALID_EMAIL_OR_PASSWORD":
        return { formError: "E-mail ou senha incorretos." };
      case "TOO_MANY_ATTEMPTS":
        return { formError: "Muitas tentativas. Aguarde um instante e tente de novo." };
      default:
        return {
          formError:
            error.body?.message ?? "Não foi possível concluir. Tente novamente.",
        };
    }
  }
  return { formError: "Algo deu errado. Tente novamente." };
}

/* -------------------------------------------------------------------------- */
/*  Sign up (coach) — creates the account and triggers the verification OTP.  */
/* -------------------------------------------------------------------------- */

export const signUpCoach = withAction(
  "auth.signup",
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const parsed = parseForm(signUpSchema, formData);
    if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
    const { name, email, password, plan } = parsed.data;

    // Cap account creation per IP (each sign-up also e-mails a verification OTP).
    if (!hit(`signup:${await clientIp()}`, 5, HOUR)) return TOO_MANY;

    const requestHeaders = await headers();
    try {
      // The clinic is created by Better Auth's `user.create.after` hook; thread
      // the chosen plan through so the new clinic starts on it (not the default).
      await withSignUpPlan(plan, () =>
        auth.api.signUpEmail({
          body: { name, email, password },
          headers: requestHeaders,
        }),
      );
    } catch (error) {
      logger.warn("auth.signup.failed", { code: errorCode(error) });
      return authError(error);
    }

    logger.info("auth.signup.ok", { provider: "email" });
    // A verification OTP was e-mailed on sign-up; confirm it next.
    redirect(`/verify-account?email=${encodeURIComponent(email)}`);
  },
);

/* -------------------------------------------------------------------------- */
/*  Sign in (email + password)                                                */
/* -------------------------------------------------------------------------- */

export const signIn = withAction(
  "auth.signin",
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const parsed = parseForm(signInSchema, formData);
    if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
    const { email, password } = parsed.data;
    // Remembered (the default): a 90-day cookie, renewed on use. Not
    // remembered: a browser-session cookie that dies with the window — the
    // point of the box for someone on a shared or borrowed device.
    const rememberMe = parsed.data.rememberMe === "on";

    // Throttle password brute force per IP.
    if (!hit(`signin:${await clientIp()}`, 10, MINUTE)) return TOO_MANY;

    let role: string | null | undefined;
    try {
      const result = await auth.api.signInEmail({
        body: { email, password, rememberMe },
        headers: await headers(),
      });
      role = result.user?.role;
    } catch (error) {
      // Unverified accounts can't sign in yet — send them to confirm the OTP.
      if (errorCode(error) === "EMAIL_NOT_VERIFIED") {
        logger.info("auth.signin.unverified");
        redirect(`/verify-account?email=${encodeURIComponent(email)}`);
      }
      logger.warn("auth.signin.failed", { code: errorCode(error) });
      return authError(error);
    }

    logger.info("auth.signin.ok", { role: role ?? undefined, rememberMe });
    redirect(homePathForRole(role));
  },
);

/* -------------------------------------------------------------------------- */
/*  Account confirmation (OTP) — verifies the e-mail, then sends to login.     */
/* -------------------------------------------------------------------------- */

export const verifyAccount = withAction(
  "auth.verify",
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const parsed = parseForm(verifySchema, formData);
    if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
    const { email, otp } = parsed.data;

    // Throttle OTP guessing per IP (the plugin's per-code cap is 3 attempts).
    if (!hit(`verify:${await clientIp()}`, 10, MINUTE)) return TOO_MANY;

    try {
      await auth.api.verifyEmailOTP({ body: { email, otp } });
    } catch (error) {
      logger.warn("auth.verify.failed", { code: errorCode(error) });
      return authError(error);
    }

    logger.info("auth.verify.ok");
    // Verifying the OTP never signs the user in (autoSignInAfterVerification is
    // off and no cookie is forged). Send them to /login to sign in themselves.
    redirect("/login?verified=1");
  },
);

/* -------------------------------------------------------------------------- */
/*  Resend an OTP (verification or password reset).                           */
/* -------------------------------------------------------------------------- */

const resendSchema = z.object({
  email: emailSchema,
  type: z.enum(["email-verification", "forget-password"]),
});

export const resendOtp = withAction(
  "auth.resendOtp",
  async (
    email: string,
    type: "email-verification" | "forget-password",
  ): Promise<ActionState> => {
    const parsed = resendSchema.safeParse({ email, type });
    if (!parsed.success) return { formError: "E-mail inválido." };

    // Cap OTP sends to curb inbox bombing + provider cost: at most one per
    // minute per address, and a looser per-IP hourly ceiling.
    const ip = await clientIp();
    if (
      !hit(`otp-send:${parsed.data.email}`, 1, MINUTE) ||
      !hit(`otp-send-ip:${ip}`, 5, HOUR)
    ) {
      return TOO_MANY;
    }

    try {
      if (parsed.data.type === "forget-password") {
        await auth.api.forgetPasswordEmailOTP({ body: { email: parsed.data.email } });
      } else {
        await auth.api.sendVerificationOTP({
          body: { email: parsed.data.email, type: "email-verification" },
        });
      }
    } catch (error) {
      logger.warn("auth.otp_resend.failed", { code: errorCode(error) });
      return authError(error);
    }
    logger.info("auth.otp_resent", { type: parsed.data.type });
    return undefined;
  },
);

/* -------------------------------------------------------------------------- */
/*  Forgot password — emails a reset OTP.                                      */
/* -------------------------------------------------------------------------- */

export const requestPasswordReset = withAction(
  "auth.requestPasswordReset",
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const parsed = parseForm(forgotSchema, formData);
    if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

    // Same OTP-send budget as the resend action (per-email + per-IP).
    const ip = await clientIp();
    if (
      !hit(`otp-send:${parsed.data.email}`, 1, MINUTE) ||
      !hit(`otp-send-ip:${ip}`, 5, HOUR)
    ) {
      // Neutral success is kept below to avoid enumeration; a throttle banner
      // here would only ever apply to the same address, so it's safe to show.
      return TOO_MANY;
    }

    try {
      await auth.api.forgetPasswordEmailOTP({ body: { email: parsed.data.email } });
    } catch (error) {
      logger.warn("auth.password_reset_request.failed", { code: errorCode(error) });
      return authError(error);
    }
    logger.info("auth.password_reset_requested");
    return { ok: true };
  },
);

/* -------------------------------------------------------------------------- */
/*  Reset password with the OTP.                                              */
/* -------------------------------------------------------------------------- */

export const resetPassword = withAction(
  "auth.resetPassword",
  async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const parsed = parseForm(resetSchema, formData);
    if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
    const { email, otp, password } = parsed.data;

    // Throttle reset-OTP guessing per IP.
    if (!hit(`reset:${await clientIp()}`, 10, MINUTE)) return TOO_MANY;

    try {
      await auth.api.resetPasswordEmailOTP({ body: { email, otp, password } });
    } catch (error) {
      logger.warn("auth.password_reset.failed", { code: errorCode(error) });
      return authError(error);
    }

    logger.info("auth.password_reset.ok");
    redirect("/login?reset=1");
  },
);

/* -------------------------------------------------------------------------- */
/*  Google OAuth — server action that returns the provider URL to redirect.   */
/* -------------------------------------------------------------------------- */

export const signInWithGoogle = withAction(
  "auth.google",
  async (): Promise<void> => {
    let url: string | undefined;
    try {
      const result = await auth.api.signInSocial({
        body: { provider: "google", callbackURL: "/dashboard" },
        headers: await headers(),
      });
      url = result.url;
    } catch (error) {
      logger.warn("auth.google.failed", { err: error });
      redirect("/login?error=google");
    }

    logger.info("auth.google.redirect");
    redirect(url ?? "/login?error=google");
  },
);
