"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";
import { type FieldErrors, parseForm, z } from "@/lib/validation";

/**
 * Result returned to client forms. Actions that finish the flow `redirect()`
 * (so they never return). Otherwise:
 * - `fieldErrors` — messages shown under specific inputs.
 * - `formError` — a banner message for errors not tied to a single field.
 * - `ok` — success while staying on the page.
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
});

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

const verifySchema = z.object({ email: emailSchema, otp: otpSchema });

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  password: newPasswordSchema,
});

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

export async function signUpCoach(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(signUpSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
  const { name, email, password } = parsed.data;

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    return authError(error);
  }

  // A verification OTP was e-mailed on sign-up; confirm it next.
  redirect(`/verify-account?email=${encodeURIComponent(email)}`);
}

/* -------------------------------------------------------------------------- */
/*  Sign in (email + password)                                                */
/* -------------------------------------------------------------------------- */

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(signInSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
  const { email, password } = parsed.data;

  let role: string | null | undefined;
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    role = result.user?.role;
  } catch (error) {
    // Unverified accounts can't sign in yet — send them to confirm the OTP.
    if (
      error instanceof APIError &&
      (error.body?.code as string | undefined) === "EMAIL_NOT_VERIFIED"
    ) {
      redirect(`/verify-account?email=${encodeURIComponent(email)}`);
    }
    return authError(error);
  }

  redirect(homePathForRole(role));
}

/* -------------------------------------------------------------------------- */
/*  Account confirmation (OTP) — verifies and, via autoSignIn, logs in.       */
/* -------------------------------------------------------------------------- */

export async function verifyAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(verifySchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
  const { email, otp } = parsed.data;

  let role: string | null | undefined;
  try {
    const result = await auth.api.verifyEmailOTP({
      body: { email, otp },
      headers: await headers(),
    });
    role = result.user?.role;
  } catch (error) {
    return authError(error);
  }

  redirect(homePathForRole(role));
}

/* -------------------------------------------------------------------------- */
/*  Resend an OTP (verification or password reset).                           */
/* -------------------------------------------------------------------------- */

const resendSchema = z.object({
  email: emailSchema,
  type: z.enum(["email-verification", "forget-password"]),
});

export async function resendOtp(
  email: string,
  type: "email-verification" | "forget-password",
): Promise<ActionState> {
  const parsed = resendSchema.safeParse({ email, type });
  if (!parsed.success) return { formError: "E-mail inválido." };

  try {
    if (parsed.data.type === "forget-password") {
      await auth.api.forgetPasswordEmailOTP({ body: { email: parsed.data.email } });
    } else {
      await auth.api.sendVerificationOTP({
        body: { email: parsed.data.email, type: "email-verification" },
      });
    }
  } catch (error) {
    return authError(error);
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  Forgot password — emails a reset OTP.                                      */
/* -------------------------------------------------------------------------- */

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(forgotSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };

  try {
    await auth.api.forgetPasswordEmailOTP({ body: { email: parsed.data.email } });
  } catch (error) {
    return authError(error);
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Reset password with the OTP.                                              */
/* -------------------------------------------------------------------------- */

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseForm(resetSchema, formData);
  if (!parsed.success) return { fieldErrors: parsed.fieldErrors };
  const { email, otp, password } = parsed.data;

  try {
    await auth.api.resetPasswordEmailOTP({ body: { email, otp, password } });
  } catch (error) {
    return authError(error);
  }

  redirect("/login?reset=1");
}

/* -------------------------------------------------------------------------- */
/*  Google OAuth — server action that returns the provider URL to redirect.   */
/* -------------------------------------------------------------------------- */

export async function signInWithGoogle(): Promise<void> {
  let url: string | undefined;
  try {
    const result = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/dashboard" },
      headers: await headers(),
    });
    url = result.url;
  } catch {
    redirect("/login?error=google");
  }

  redirect(url ?? "/login?error=google");
}
