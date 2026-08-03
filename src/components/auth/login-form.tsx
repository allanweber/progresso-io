"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AuthDivider } from "@/components/auth/auth-divider";
import { Field } from "@/components/auth/field";
import { GoogleButton } from "@/components/auth/google-button";

export function LoginForm() {
  // UI only — not wired to any backend yet.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-8">
        <h1 className="mb-1.5 font-heading text-[26px] font-bold tracking-[-0.02em] text-foreground">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link href="/registro" className="font-medium text-primary hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>

      <GoogleButton label="Entrar com Google" className="mb-4" />

      <div className="mb-5">
        <AuthDivider label="ou entre com e-mail" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          id="email"
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
        />

        <div className="space-y-2">
          <Field
            id="password"
            label="Senha"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <div className="text-right">
            <Link
              href="/esqueci-a-senha"
              className="text-[13px] text-primary hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full">
          Entrar
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-[#94A3B8]">
        Ao entrar você concorda com os{" "}
        <Link href="#" className="text-primary hover:underline">
          Termos de Uso
        </Link>{" "}
        e{" "}
        <Link href="#" className="text-primary hover:underline">
          Privacidade
        </Link>
      </p>
    </div>
  );
}
