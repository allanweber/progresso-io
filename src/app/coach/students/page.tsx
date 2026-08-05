"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  ACCESS_LABELS,
  avatarColor,
  deriveAccess,
  deriveStudentState,
  studentInitials,
  STUDENT_STATE_STYLES,
  type StudentRosterDto,
  type StudentStateKey,
} from "@/lib/students";

const FILTERS: { key: StudentStateKey | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "invited", label: "Convidados" },
  { key: "inactive", label: "Inativos" },
  { key: "archived", label: "Arquivados" },
];

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const columnHelper = createColumnHelper<StudentRosterDto>();

const columns = [
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
  columnHelper.display({
    id: "state",
    header: "Estado",
    cell: (ctx) => {
      const state = deriveStudentState(ctx.row.original);
      const style = STUDENT_STATE_STYLES[state.key];
      return (
        <span
          className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ color: style.color, background: style.bg }}
        >
          {state.label}
        </span>
      );
    },
  }),
  columnHelper.display({
    id: "access",
    header: "Acesso",
    cell: (ctx) => (
      <span className="text-[13px] text-[#475569]">
        {ACCESS_LABELS[deriveAccess(ctx.row.original)]}
      </span>
    ),
  }),
  columnHelper.accessor((s) => s.goal ?? "—", {
    id: "goal",
    header: "Objetivo",
    cell: (ctx) => (
      <span className="text-[13px] text-[#475569]">{ctx.getValue()}</span>
    ),
  }),
  columnHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Última atividade",
    cell: (ctx) => (
      <span className="text-[13px] text-[#94A3B8]">
        {dateFmt.format(new Date(ctx.getValue()))}
      </span>
    ),
  }),
];

export default function StudentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<StudentStateKey | "all">("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students"],
    queryFn: () =>
      apiFetch<{ students: StudentRosterDto[] }>("/api/students").then(
        (r) => r.students,
      ),
  });

  const students = useMemo(() => data ?? [], [data]);
  const filtered = useMemo(
    () =>
      filter === "all"
        ? students
        : students.filter((s) => deriveStudentState(s).key === filter),
    [students, filter],
  );

  const activeCount = useMemo(
    () => students.filter((s) => s.status !== "archived").length,
    [students],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Alunos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length} no total · {activeCount} ativos
          </p>
        </div>
        <Button asChild>
          <Link href="/coach/students/new">
            <Plus className="size-4" />
            Adicionar aluno
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground"
                : "rounded-full border border-border bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#475569] transition-colors hover:border-primary hover:text-primary"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Carregando alunos…
          </div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {students.length === 0
              ? "Nenhum aluno ainda. Adicione o primeiro para começar."
              : "Nenhum aluno neste filtro."}
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
                  onClick={() =>
                    router.push(`/coach/students/${row.original.id}`)
                  }
                  className="cursor-pointer border-b border-[#F1F5F9] last:border-0 transition-colors hover:bg-surface-light"
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
    </div>
  );
}
