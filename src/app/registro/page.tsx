import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { RegisterWizard } from "@/components/auth/register-wizard";

export const metadata: Metadata = {
  title: "Criar conta — Progresso IO",
  description: "Crie sua conta Progresso IO. 14 dias grátis, sem cartão.",
};

export default function RegistroPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-light px-6 py-10">
      <Link href="/" className="mb-9" title="Voltar para a landing page">
        <Logo />
      </Link>

      <RegisterWizard />

      <p className="mt-5 text-[13px] text-[#94A3B8]">
        Já tem conta?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
