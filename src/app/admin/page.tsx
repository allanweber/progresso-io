import type { Metadata } from "next";
import { ShieldCheck, Users } from "lucide-react";

import { requireRole } from "@/lib/session";

export const metadata: Metadata = {
  title: "Admin — Progresso IO",
};

export default async function AdminDashboardPage() {
  const session = await requireRole(["admin"]);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-6 text-primary" strokeWidth={2} />
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Painel do administrador
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Olá, {firstName}. Gestão de coaches, alunos e da plataforma.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary-light">
            <Users className="size-5 text-primary" strokeWidth={2} />
          </div>
          <div className="font-heading text-2xl font-bold text-foreground">—</div>
          <div className="text-xs text-muted-foreground">Usuários na plataforma</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Ferramentas de administração (listar, promover e banir usuários)
          aparecerão aqui.
        </p>
      </div>
    </div>
  );
}
