import type { Metadata } from "next";

import { requireRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meu treino — Progresso IO",
};

export default async function StudentDashboardPage() {
  const session = await requireRole(["aluno"]);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Olá, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Aqui você verá seus treinos, dietas e check-ins com seu coach.
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Seu plano de treino ainda não foi liberado. Assim que seu coach
          publicar, ele aparece por aqui.
        </p>
      </div>
    </div>
  );
}
