"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { resetPassword } from "@/app/actions/auth";
import { Field } from "@/components/auth/field";
import { FormError } from "@/components/auth/form-error";
import { OtpInput } from "@/components/auth/otp-input";
import { ResendOtp } from "@/components/auth/resend-otp";
import { SubmitButton } from "@/components/ui/submit-button";

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(resetPassword, undefined);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    otp.length === 6 && password.length >= 8 && password === confirm;

  return (
    <form action={formAction}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="otp" value={otp} />

      <div className="mb-7">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-light">
          <KeyRound className="size-[22px] text-primary" strokeWidth={2} />
        </div>
        <h1 className="mb-1.5 font-heading text-[22px] font-bold text-foreground">
          Redefinir senha
        </h1>
        <p className="text-sm leading-[1.6] text-muted-foreground">
          Digite o código enviado para{" "}
          <strong className="text-foreground">{email}</strong> e escolha uma
          nova senha.
        </p>
      </div>

      <div className="mb-2 space-y-1.5">
        <span className="block text-[13px] font-semibold text-[#334155]">
          Código de verificação
        </span>
        <OtpInput value={otp} onChange={setOtp} autoFocus />
      </div>
      <div className="mb-5">
        <ResendOtp email={email} type="forget-password" />
      </div>

      <div className="mb-5 space-y-4">
        <FormError message={state?.error} />
        <Field
          id="password"
          name="password"
          label="Nova senha"
          type="password"
          placeholder="mínimo 8 caracteres"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="space-y-1.5">
          <Field
            id="confirm"
            label="Confirmar nova senha"
            type="password"
            placeholder="repita a senha"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="text-[13px] text-destructive">
              As senhas não coincidem.
            </p>
          )}
        </div>
      </div>

      <SubmitButton
        size="lg"
        className="mb-4 w-full"
        disabled={!canSubmit}
        pendingLabel="Redefinindo…"
      >
        Redefinir senha
      </SubmitButton>

      <div className="text-center">
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
