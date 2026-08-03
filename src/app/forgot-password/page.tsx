import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Progresso IO",
  description: "Recupere o acesso à sua conta Progresso IO.",
};

export default function EsqueciASenhaPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-light px-6 py-10">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>

      <div className="w-full max-w-[400px] rounded-2xl bg-white px-10 py-9 shadow-[0_4px_24px_rgba(15,23,42,0.08)]">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
