"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { ResendOtp } from "@/components/auth/resend-otp";

export function VerifyAccountForm({ email }: { email: string }) {
  const [otp, setOtp] = useState("");
  const [verified, setVerified] = useState(false);

  if (verified) {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#DCFCE7]">
          <ShieldCheck className="size-7 text-primary" strokeWidth={2.5} />
        </div>
        <h1 className="mb-2 font-heading text-xl font-bold text-foreground">
          Conta confirmada!
        </h1>
        <p className="mb-7 text-sm leading-[1.6] text-muted-foreground">
          Sua conta foi verificada com sucesso.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setVerified(true);
      }}
    >
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

      <div className="mb-5">
        <OtpInput value={otp} onChange={setOtp} autoFocus />
      </div>

      <Button
        type="submit"
        size="lg"
        className="mb-4 w-full"
        disabled={otp.length < 6}
      >
        Confirmar conta
      </Button>

      <ResendOtp />

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
