"use client";

import Link from "next/link";

import { StudentForm } from "@/components/students/student-form";

export default function NewStudentPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/coach/students"
        className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Novo aluno
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastre os dados do aluno. O convite de acesso ao portal é enviado
        depois, quando você quiser — é uma ação à parte.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <StudentForm mode="create" />
      </div>
    </div>
  );
}
