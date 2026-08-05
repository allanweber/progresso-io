"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Mail, Pencil, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  ACCESS_LABELS,
  avatarColor,
  deriveAccess,
  deriveStudentState,
  MODALITY_LABELS,
  studentInitials,
  STUDENT_STATE_STYLES,
  type StudentRosterDto,
} from "@/lib/students";

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: student, isLoading, isError, error } = useQuery({
    queryKey: ["student", id],
    queryFn: () =>
      apiFetch<{ student: StudentRosterDto }>(`/api/students/${id}`).then(
        (r) => r.student,
      ),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["student", id] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
  }

  const invite = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}/invite`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: () => apiFetch(`/api/students/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const reactivate = useMutation({
    mutationFn: () =>
      apiFetch(`/api/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }
  if (isError || !student) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/coach/students"
          className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
        >
          ← Alunos
        </Link>
        <p className="mt-4 text-sm text-destructive">
          {isError ? (error as Error).message : "Aluno não encontrado."}
        </p>
      </div>
    );
  }

  const state = deriveStudentState(student);
  const style = STUDENT_STATE_STYLES[state.key];
  const details = [
    { label: "E-mail", value: student.email },
    { label: "Telefone", value: student.phone ?? "—" },
    { label: "Objetivo", value: student.goal ?? "—" },
    { label: "Modalidade", value: MODALITY_LABELS[student.modality] },
    { label: "Acesso", value: ACCESS_LABELS[deriveAccess(student)] },
  ];

  const busy = invite.isPending || archive.isPending || reactivate.isPending;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/coach/students"
        className="text-[13px] text-[#94A3B8] transition-colors hover:text-primary"
      >
        ← Alunos
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white"
          style={{ background: avatarColor(student.id) }}
        >
          {studentInitials(student.firstName, student.lastName)}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {student.firstName} {student.lastName}
            </h1>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ color: style.color, background: style.bg }}
            >
              {state.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{student.email}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button asChild variant="outline">
          <Link href={`/coach/students/${student.id}/edit`}>
            <Pencil className="size-4" />
            Editar
          </Link>
        </Button>

        {!student.hasAccount && student.status !== "archived" && (
          <Button onClick={() => invite.mutate()} disabled={busy}>
            <Mail className="size-4" />
            {invite.isPending
              ? "Enviando…"
              : student.pendingInvite
                ? "Reenviar convite"
                : "Convidar"}
          </Button>
        )}

        {student.status === "archived" ? (
          <Button
            variant="outline"
            onClick={() => reactivate.mutate()}
            disabled={busy}
          >
            <RotateCcw className="size-4" />
            Reativar
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => archive.mutate()}
            disabled={busy}
          >
            <Archive className="size-4" />
            Arquivar
          </Button>
        )}
      </div>

      {invite.isSuccess && (
        <p className="mt-3 text-[13px] font-medium text-primary">
          Convite enviado para {student.email}.
        </p>
      )}
      {(invite.isError || archive.isError || reactivate.isError) && (
        <p className="mt-3 text-[13px] font-medium text-destructive">
          {
            ((invite.error ?? archive.error ?? reactivate.error) as Error)
              .message
          }
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Dados
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-[#94A3B8]">{d.label}</dt>
              <dd className="font-medium text-foreground">{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
