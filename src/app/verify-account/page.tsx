import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { VerifyAccountForm } from "@/components/auth/verify-account-form";

export const metadata: Metadata = {
  title: "Confirmar conta — Progresso IO",
  description: "Confirme sua conta Progresso IO com o código enviado por e-mail.",
};

export default async function VerifyAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthCard>
      <VerifyAccountForm email={email ?? "seu e-mail"} />
    </AuthCard>
  );
}
