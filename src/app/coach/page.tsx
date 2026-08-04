import type { Metadata } from "next";
import { Dumbbell, TrendingUp, Users, Utensils } from "lucide-react";

import { requireRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Dashboard — Progresso IO",
};

const stats = [
  { label: "Alunos ativos", value: "—", icon: Users },
  { label: "Treinos criados", value: "—", icon: Dumbbell },
  { label: "Dietas ativas", value: "—", icon: Utensils },
  { label: "Check-ins na semana", value: "—", icon: TrendingUp },
];

export default async function CoachDashboardPage() {
  const session = await requireRole(["coach"]);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        Olá, {firstName} 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Este é o seu painel. As funcionalidades chegam em breve — por enquanto,
        um espaço reservado.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]"
          >
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary-light">
              <Icon className="size-5 text-primary" strokeWidth={2} />
            </div>
            <div className="font-heading text-2xl font-bold text-foreground">
              {value}
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Gestão de alunos, treinos, dietas e evolução aparecerão aqui.
        </p>
      </div>
    </div>
  );
}
