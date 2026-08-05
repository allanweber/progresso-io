"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ShieldAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { AdminStudentDto, ClinicOption } from "@/lib/admin";
import { avatarColor, studentInitials } from "@/lib/students";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const columnHelper = createColumnHelper<AdminStudentDto>();

export default function AdminStudentsPage() {
  const queryClient = useQueryClient();
  const [clinicId, setClinicId] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AdminStudentDto | null>(
    null,
  );

  // Debounce the e-mail box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(emailInput.trim()), 300);
    return () => clearTimeout(t);
  }, [emailInput]);

  const clinics = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
  });

  const students = useQuery({
    queryKey: ["admin-students", clinicId, debouncedEmail],
    queryFn: () => {
      const params = new URLSearchParams();
      if (clinicId) params.set("clinicId", clinicId);
      if (debouncedEmail) params.set("email", debouncedEmail);
      const qs = params.toString();
      return apiFetch<{ students: AdminStudentDto[] }>(
        `/api/admin/students${qs ? `?${qs}` : ""}`,
      ).then((r) => r.students);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/admin/students/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      setPendingDelete(null);
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((s) => `${s.firstName} ${s.lastName}`, {
        id: "student",
        header: "Aluno",
        cell: (ctx) => {
          const s = ctx.row.original;
          return (
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                style={{ background: avatarColor(s.id) }}
              >
                {studentInitials(s.firstName, s.lastName)}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">
                  {s.firstName} {s.lastName}
                </div>
                <div className="truncate text-xs text-[#94A3B8]">{s.email}</div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("clinicName", {
        id: "clinic",
        header: "Clínica",
        cell: (ctx) => (
          <span className="text-[13px] text-[#475569]">{ctx.getValue()}</span>
        ),
      }),
      columnHelper.display({
        id: "access",
        header: "Acesso",
        cell: (ctx) => (
          <span className="text-[13px] text-[#475569]">
            {ctx.row.original.hasAccount ? "Portal" : "Offline"}
          </span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        id: "createdAt",
        header: "Criado em",
        cell: (ctx) => (
          <span className="text-[13px] text-[#94A3B8]">
            {dateFmt.format(new Date(ctx.getValue()))}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (ctx) => (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPendingDelete(ctx.row.original)}
              aria-label={`Excluir ${ctx.row.original.firstName} ${ctx.row.original.lastName}`}
              className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-2.5 py-1.5 text-[13px] font-medium text-destructive transition-colors hover:border-destructive hover:bg-destructive/5"
            >
              <Trash2 className="size-4" />
              Excluir
            </button>
          </div>
        ),
      }),
    ],
    [],
  );

  const rows = useMemo(() => students.data ?? [], [students.data]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-6 text-primary" strokeWidth={2} />
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Gestão de alunos
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Todos os alunos da plataforma. A exclusão aqui é permanente e remove o
        aluno de todas as clínicas e tabelas.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
          aria-label="Filtrar por clínica"
          className="h-10 rounded-[10px] border-[1.5px] border-input bg-white px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">Todas as clínicas</option>
          {(clinics.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="Filtrar por e-mail…"
          aria-label="Filtrar por e-mail"
          className="h-10 min-w-[220px] flex-1 rounded-[10px] border-[1.5px] border-input bg-white px-3 text-sm text-foreground outline-none placeholder:text-[#94A3B8] focus:border-primary"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        {students.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Carregando alunos…
          </div>
        ) : students.isError ? (
          <div className="p-10 text-center text-sm text-destructive">
            {(students.error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum aluno encontrado com esses filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8]"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#F1F5F9] last:border-0"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !remove.isPending && setPendingDelete(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-[0_8px_40px_rgba(15,23,42,0.15)]">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10">
                <ShieldAlert className="size-5 text-destructive" />
              </div>
              <h2 className="font-heading text-lg font-bold text-foreground">
                Excluir aluno
              </h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Excluir{" "}
              <span className="font-semibold text-foreground">
                {pendingDelete.firstName} {pendingDelete.lastName}
              </span>{" "}
              ({pendingDelete.email}) da clínica{" "}
              <span className="font-semibold text-foreground">
                {pendingDelete.clinicName}
              </span>
              ? Esta ação é permanente e remove o aluno, seus convites
              {pendingDelete.hasAccount ? " e o login de acesso (sessões e credenciais)" : ""}
              . Não é possível desfazer.
            </p>

            {remove.error instanceof ApiError && (
              <div className="mt-4 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
                {remove.error.message}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={remove.isPending}
                className="rounded-[10px] border-[1.5px] border-input px-4 py-2 text-sm font-medium text-[#334155] transition-colors hover:bg-secondary disabled:opacity-60"
              >
                Cancelar
              </button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => remove.mutate(pendingDelete.id)}
                disabled={remove.isPending}
              >
                {remove.isPending ? "Excluindo…" : "Excluir definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
