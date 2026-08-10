"use client";

import Link from "next/link";

import { StudentRegisterForm } from "@/components/students/student-register-form";

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
        Convidar novo aluno
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O aluno online recebe um link de acesso ao portal + a anamnese pelo
        WhatsApp. O aluno offline é registrado e você preenche a anamnese.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <StudentRegisterForm />
      </div>
    </div>
  );
}
