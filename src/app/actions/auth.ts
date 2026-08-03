"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/roles";

/**
 * Result returned to client forms. Actions that finish the flow `redirect()`
 * (so they never return); actions that stay on the page return `{ ok: true }`
 * on success or `{ error }` on failure.
 */
export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Maps a Better Auth error to a friendly PT-BR message. */
function messageFor(error: unknown): string {
  if (error instanceof APIError) {
    const code = (error.body?.code as string | undefined) ?? "";
    switch (code) {
      case "INVALID_EMAIL_OR_PASSWORD":
        return "E-mail ou senha incorretos.";
      case "USER_ALREADY_EXISTS":
        return "Já existe uma conta com este e-mail.";
      case "INVALID_OTP":
        return "Código inválido. Verifique e tente novamente.";
      case "OTP_EXPIRED":
        return "O código expirou. Solicite um novo.";
      case "TOO_MANY_ATTEMPTS":
        return "Muitas tentativas. Aguarde um instante e tente de novo.";
      default:
        return error.body?.message ?? "Não foi possível concluir. Tente novamente.";
    }
  }
  return "Algo deu errado. Tente novamente.";
}

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/* -------------------------------------------------------------------------- */
/*  Sign up (coach) — creates the account and triggers the verification OTP.  */
/* -------------------------------------------------------------------------- */

export async function signUpCoach(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = asString(formData.get("name"));
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));

  if (!name || !email || !password) {
    return { error: "Preencha nome, e-mail e senha." };
  }
  if (password.length < 8) {
    return { error: "A senha deve ter no mínimo 8 caracteres." };
  }

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    return { error: messageFor(error) };
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
  const email = asString(formData.get("email")).toLowerCase();
  const password = asString(formData.get("password"));

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

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
    return { error: messageFor(error) };
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
  const email = asString(formData.get("email")).toLowerCase();
  const otp = asString(formData.get("otp"));

  if (otp.length !== 6) {
    return { error: "Digite o código de 6 dígitos." };
  }

  let role: string | null | undefined;
  try {
    const result = await auth.api.verifyEmailOTP({
      body: { email, otp },
      headers: await headers(),
    });
    role = result.user?.role;
  } catch (error) {
    return { error: messageFor(error) };
  }

  redirect(homePathForRole(role));
}

/* -------------------------------------------------------------------------- */
/*  Resend an OTP (verification or password reset).                           */
/* -------------------------------------------------------------------------- */

export async function resendOtp(
  email: string,
  type: "email-verification" | "forget-password",
): Promise<ActionState> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { error: "E-mail inválido." };

  try {
    if (type === "forget-password") {
      await auth.api.forgetPasswordEmailOTP({ body: { email: normalized } });
    } else {
      await auth.api.sendVerificationOTP({
        body: { email: normalized, type: "email-verification" },
      });
    }
  } catch (error) {
    return { error: messageFor(error) };
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
  const email = asString(formData.get("email")).toLowerCase();
  if (!email) return { error: "Informe seu e-mail." };

  try {
    await auth.api.forgetPasswordEmailOTP({ body: { email } });
  } catch (error) {
    return { error: messageFor(error) };
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
  const email = asString(formData.get("email")).toLowerCase();
  const otp = asString(formData.get("otp"));
  const password = asString(formData.get("password"));

  if (otp.length !== 6) return { error: "Digite o código de 6 dígitos." };
  if (password.length < 8) {
    return { error: "A senha deve ter no mínimo 8 caracteres." };
  }

  try {
    await auth.api.resetPasswordEmailOTP({
      body: { email, otp, password },
    });
  } catch (error) {
    return { error: messageFor(error) };
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

/* -------------------------------------------------------------------------- */
/*  Sign out                                                                  */
/* -------------------------------------------------------------------------- */

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
