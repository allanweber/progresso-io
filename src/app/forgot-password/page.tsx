import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Progresso IO",
  description: "Recupere o acesso à sua conta Progresso IO.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
