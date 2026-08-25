"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { StudentForm } from "@/components/students/student-form";
import { apiFetch } from "@/lib/api-client";
import type { StudentRosterDto } from "@/lib/students";

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/coach/students/${id}`}
        className="text-body-dense text-meta transition-colors hover:text-primary"
      >
        ← Perfil do aluno
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-bold text-foreground">
        Editar aluno
      </h1>

      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : data ? (
          <StudentForm mode="edit" student={data} />
        ) : null}
      </div>
    </div>
  );
}
