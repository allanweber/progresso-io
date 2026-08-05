import type { Metadata } from "next";

import { BrandPanel } from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar — Progresso IO",
  description: "Acesse sua conta Progresso IO.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; error?: string; verified?: string }>;
}) {
  const { reset, error, verified } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center bg-surface-light px-6 py-10">
        <LoginForm
          justReset={reset === "1"}
          justVerified={verified === "1"}
          oauthError={error === "google"}
        />
      </div>
    </div>
  );
}
