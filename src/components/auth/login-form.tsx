"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signIn, signInWithGoogle } from "@/app/actions/auth";
import { AuthDivider } from "@/components/auth/auth-divider";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/form-error";
import { GoogleButton } from "@/components/auth/google-button";
import { SubmitButton } from "@/components/ui/submit-button";

export function LoginForm({
  justReset,
  justVerified,
  justActivated,
  oauthError,
}: {
  justReset?: boolean;
  justVerified?: boolean;
  justActivated?: boolean;
  oauthError?: boolean;
}) {
  const [state, formAction] = useActionState(signIn, undefined);
  const banner =
    state?.formError ??
    (oauthError ? "Não foi possível entrar com o Google. Tente novamente." : undefined);

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8">
        <h1 className="mb-1.5 font-heading text-[26px] font-bold tracking-[-0.02em] text-foreground">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>

      {justVerified && (
        <div className="mb-4 rounded-[10px] bg-[#DCFCE7] px-4 py-3 text-[13px] font-medium text-primary">
          Conta confirmada! Entre para continuar.
        </div>
      )}

      {justActivated && (
        <div className="mb-4 rounded-[10px] bg-[#DCFCE7] px-4 py-3 text-[13px] font-medium text-primary">
          Acesso ativado! Entre para continuar.
        </div>
      )}

      {justReset && (
        <div className="mb-4 rounded-[10px] bg-[#DCFCE7] px-4 py-3 text-[13px] font-medium text-primary">
          Senha redefinida! Entre com a nova senha.
        </div>
      )}

      <form action={signInWithGoogle}>
        <GoogleButton type="submit" label="Entrar com Google" className="mb-4" />
      </form>

      <div className="mb-5">
        <AuthDivider label="ou entre com e-mail" />
      </div>

      <form action={formAction} className="space-y-4">
        <FormError message={banner} />

        <Field
          id="email"
          name="email"
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
          error={state?.fieldErrors?.email}
        />

        <div className="space-y-2">
          <Field
            id="password"
            name="password"
            label="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            error={state?.fieldErrors?.password}
          />
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-[13px] text-primary hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>
        </div>

        <SubmitButton size="lg" className="w-full">
          Entrar
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-xs text-[#94A3B8]">
        Ao entrar você concorda com os{" "}
        <Link href="/terms" className="text-primary hover:underline">
          Termos de Uso
        </Link>{" "}
        e{" "}
        <Link href="/privacy" className="text-primary hover:underline">
          Privacidade
        </Link>
      </p>
    </div>
  );
}
