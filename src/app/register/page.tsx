import type { Metadata } from "next";
import Link from "next/link";

import { BrandPanel } from "@/components/auth/brand-panel";
import { RegisterWizard } from "@/components/auth/register-wizard";

export const metadata: Metadata = {
  title: "Criar conta — Progresso IO",
  description: "Crie sua conta Progresso IO. 14 dias grátis, sem cartão.",
};

export default function RegistroPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <div className="flex flex-1 flex-col items-center justify-center bg-surface-light px-6 py-10">
        <RegisterWizard />

        <p className="mt-5 text-body-dense text-[#94A3B8]">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
