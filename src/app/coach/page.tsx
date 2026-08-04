import type { Metadata } from "next";
import { Dumbbell, TrendingUp, Users, Utensils } from "lucide-react";

import { clinics, students } from "@/server/dal";
import { requireClinic } from "@/server/tenant";

export const metadata: Metadata = {
  title: "Dashboard — Progresso IO",
};

export default async function CoachDashboardPage() {
  // Tenant-scoped: everything here reads through the DAL for this clinic only.
  const ctx = await requireClinic();
  const [clinic, studentCount] = await Promise.all([
    clinics.getClinic(ctx),
    students.countStudents(ctx),
  ]);

  const stats = [
    { label: "Alunos ativos", value: String(studentCount), icon: Users },
    { label: "Treinos criados", value: "—", icon: Dumbbell },
    { label: "Dietas ativas", value: "—", icon: Utensils },
    { label: "Check-ins na semana", value: "—", icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        {clinic?.name ?? "Seu painel"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Este é o painel da sua clínica. As funcionalidades chegam em breve — por
        enquanto, um espaço reservado.
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
