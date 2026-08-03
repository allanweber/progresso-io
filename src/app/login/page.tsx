import type { Metadata } from "next";

import { BrandPanel } from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar — Progresso IO",
  description: "Acesse sua conta Progresso IO.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center bg-surface-light px-6 py-10">
        <LoginForm />
      </div>
    </div>
  );
}
