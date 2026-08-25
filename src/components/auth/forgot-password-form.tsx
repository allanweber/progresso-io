"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, MailCheck } from "lucide-react";

import { requestPasswordReset } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/form-error";
import { SubmitButton } from "@/components/ui/submit-button";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, undefined);
  const [email, setEmail] = useState("");

  if (state?.ok) {
    const resetHref = email
      ? `/reset-password?email=${encodeURIComponent(email)}`
      : "/reset-password";

    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-[18px] flex size-14 items-center justify-center rounded-full bg-[#DCFCE7]">
          <MailCheck className="size-[26px] text-primary" strokeWidth={2.5} />
        </div>
        <h1 className="mb-2 font-heading text-xl font-bold text-foreground">
          Verifique seu e-mail
        </h1>
        <p className="mb-7 text-sm leading-[1.6] text-muted-foreground">
          Enviamos um código de recuperação para{" "}
          <strong className="text-foreground">{email || "seu e-mail"}</strong>.
          Verifique sua caixa de entrada e spam.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href={resetHref}>Inserir código</Link>
        </Button>
        <Link
          href="/login"
          className="mt-3 block w-full text-body-dense text-meta hover:text-muted-foreground"
        >
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <div className="mb-7">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-light">
          <Lock className="size-[22px] text-primary" strokeWidth={2} />
        </div>
        <h1 className="mb-1.5 font-heading text-[22px] font-bold text-foreground">
          Esqueceu a senha?
        </h1>
        <p className="text-sm text-muted-foreground">
          Digite seu e-mail e enviaremos um código de recuperação.
        </p>
      </div>

      <div className="mb-5 space-y-4">
        <FormError message={state?.formError} />
        <Field
          id="email"
          name="email"
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={state?.fieldErrors?.email}
        />
      </div>

      <SubmitButton size="lg" className="mb-4 w-full" pendingLabel="Enviando…">
        Enviar código
      </SubmitButton>
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
