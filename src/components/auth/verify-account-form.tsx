"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { verifyAccount } from "@/app/actions/auth";
import { FormError } from "@/components/auth/form-error";
import { OtpInput } from "@/components/auth/otp-input";
import { ResendOtp } from "@/components/auth/resend-otp";
import { SubmitButton } from "@/components/ui/submit-button";

export function VerifyAccountForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(verifyAccount, undefined);
  const [otp, setOtp] = useState("");

  return (
    <form action={formAction}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="otp" value={otp} />

      <div className="mb-7">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-light">
          <MailCheck className="size-[22px] text-primary" strokeWidth={2} />
        </div>
        <h1 className="mb-1.5 font-heading text-[22px] font-bold text-foreground">
          Confirme sua conta
        </h1>
        <p className="text-sm leading-[1.6] text-muted-foreground">
          Enviamos um código de 6 dígitos para{" "}
          <strong className="text-foreground">{email}</strong>. Digite-o abaixo
          para ativar sua conta.
        </p>
      </div>

      <div className="mb-5 space-y-3">
        <OtpInput value={otp} onChange={setOtp} autoFocus />
        <FormError message={state?.error} />
      </div>

      <SubmitButton
        size="lg"
        className="mb-4 w-full"
        disabled={otp.length < 6}
        pendingLabel="Confirmando…"
      >
        Confirmar conta
      </SubmitButton>

      <ResendOtp email={email} type="email-verification" />

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar ao login
        </Link>
      </div>
    </form>
  );
}
