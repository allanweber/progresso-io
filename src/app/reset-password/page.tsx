import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha — Progresso IO",
  description: "Redefina sua senha Progresso IO com o código enviado por e-mail.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthCard className="max-w-[440px]">
      <ResetPasswordForm email={email ?? "seu e-mail"} />
    </AuthCard>
  );
}
