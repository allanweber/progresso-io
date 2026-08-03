"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/auth/field";
import { OtpInput } from "@/components/auth/otp-input";
import { ResendOtp } from "@/components/auth/resend-otp";

export function ResetPasswordForm({ email }: { email: string }) {
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = otp.length === 6 && password.length >= 8 && password === confirm;

  if (done) {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#DCFCE7]">
          <Check className="size-7 text-primary" strokeWidth={2.5} />
        </div>
        <h1 className="mb-2 font-heading text-xl font-bold text-foreground">
          Senha redefinida!
        </h1>
        <p className="mb-7 text-sm leading-[1.6] text-muted-foreground">
          Sua senha foi alterada com sucesso. Já pode entrar com a nova senha.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) setDone(true);
      }}
    >
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
        <ResendOtp />
      </div>

      <div className="mb-5 space-y-4">
        <Field
          id="password"
          label="Nova senha"
          type="password"
          placeholder="mínimo 8 caracteres"
          autoComplete="new-password"
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

      <Button
        type="submit"
        size="lg"
        className="mb-4 w-full"
        disabled={!canSubmit}
      >
        Redefinir senha
      </Button>

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
