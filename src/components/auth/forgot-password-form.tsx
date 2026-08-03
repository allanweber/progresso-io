"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/auth/field";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");

  if (sent) {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-[18px] flex size-14 items-center justify-center rounded-full bg-[#DCFCE7]">
          <MailCheck className="size-[26px] text-primary" strokeWidth={2.5} />
        </div>
        <h1 className="mb-2 font-heading text-xl font-bold text-foreground">
          Verifique seu e-mail
        </h1>
        <p className="mb-7 text-sm leading-[1.6] text-muted-foreground">
          Enviamos um link de recuperação para{" "}
          <strong className="text-foreground">{email || "seu e-mail"}</strong>.
          Verifique sua caixa de entrada e spam.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Voltar ao login</Link>
        </Button>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 w-full text-[13px] text-[#94A3B8] hover:text-muted-foreground"
        >
          Não recebeu? Reenviar
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="mb-7">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-light">
          <Lock className="size-[22px] text-primary" strokeWidth={2} />
        </div>
        <h1 className="mb-1.5 font-heading text-[22px] font-bold text-foreground">
          Esqueceu a senha?
        </h1>
        <p className="text-sm text-muted-foreground">
          Digite seu e-mail e enviaremos um link de recuperação.
        </p>
      </div>

      <div className="mb-5">
        <Field
          id="email"
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <Button type="submit" size="lg" className="mb-4 w-full">
        Enviar link de recuperação
      </Button>
      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2.5} />
        Voltar ao login
      </Link>
    </form>
  );
}
