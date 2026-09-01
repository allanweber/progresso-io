import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ShieldCheck, Users } from "lucide-react";

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
        <Link
          href="/admin/students"
          className="group rounded-2xl bg-white p-5 shadow-rest transition-colors hover:border-primary"
        >
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary-light">
            <Users className="size-5 text-primary" strokeWidth={2} />
          </div>
          <div className="font-heading text-lg font-bold text-foreground group-hover:text-primary">
            Gestão de alunos
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Buscar por clínica ou e-mail e excluir alunos definitivamente.
          </div>
        </Link>

        <Link
          href="/admin/foods"
          className="group rounded-2xl bg-white p-5 shadow-rest transition-colors hover:border-primary"
        >
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary-light">
            <BookOpen className="size-5 text-primary" strokeWidth={2} />
          </div>
          <div className="font-heading text-lg font-bold text-foreground group-hover:text-primary">
            Catálogo de alimentos
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Curar o catálogo base e ver os alimentos próprios de cada clínica.
          </div>
        </Link>

        <Link
          href="/admin/admins"
          className="group rounded-2xl bg-white p-5 shadow-rest transition-colors hover:border-primary"
        >
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary-light">
            <ShieldCheck className="size-5 text-primary" strokeWidth={2} />
          </div>
          <div className="font-heading text-lg font-bold text-foreground group-hover:text-primary">
            Administradores
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Convidar novos administradores por e-mail e remover acessos.
          </div>
        </Link>
      </div>
    </div>
  );
}
