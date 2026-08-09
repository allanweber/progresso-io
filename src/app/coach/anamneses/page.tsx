"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ClipboardList, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import {
  ANAMNESIS_MODALITY_LABELS,
  ANAMNESIS_OBJECTIVE_LABELS,
  type AnamnesisListItemDto,
  type AnamnesisListResponse,
} from "@/lib/anamneses";

const PAGE_SIZE = 25;

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const columnHelper = createColumnHelper<AnamnesisListItemDto>();

const columns = [
  columnHelper.accessor("name", {
    id: "name",
    header: "Anamnese",
    cell: (ctx) => (
      <span className="font-semibold text-foreground">{ctx.getValue()}</span>
    ),
  }),
  columnHelper.accessor("objective", {
    id: "objective",
    header: "Objetivo",
    cell: (ctx) => (
      <Badge variant="base" className="font-medium">
        {ANAMNESIS_OBJECTIVE_LABELS[ctx.getValue()]}
      </Badge>
    ),
  }),
  columnHelper.accessor("modality", {
    id: "modality",
    header: "Modalidade",
    cell: (ctx) => (
      <span className="text-[13px] text-[#475569]">
        {ANAMNESIS_MODALITY_LABELS[ctx.getValue()]}
      </span>
    ),
  }),
  columnHelper.accessor("questionCount", {
    id: "questionCount",
    header: "Perguntas",
    cell: (ctx) => (
      <span className="text-[13px] text-[#475569]">
        {ctx.getValue()} em {ctx.row.original.sectionCount} seção(ões)
      </span>
    ),
  }),
  columnHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Atualizada",
    cell: (ctx) => (
      <span className="text-[13px] text-[#94A3B8]">
        {dateFmt.format(new Date(ctx.getValue()))}
      </span>
    ),
  }),
];

export default function AnamnesesListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    router.replace(`${pathname}${qs}`, { scroll: false });
  }, [search, pathname, router]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["anamneses", query],
    queryFn: () => apiFetch<AnamnesisListResponse>(`/api/anamneses?${query}`),
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // TanStack Table (required by the frontend rules) returns functions the React
  // Compiler can't memoize — a known, harmless incompatibility for this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Anamneses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte e gerencie os questionários de anamnese da sua clínica.
          </p>
        </div>
        <Button asChild>
          <Link href="/coach/anamneses/new">
            <Plus className="size-4" />
            Nova anamnese
          </Link>
        </Button>
      </div>

      <div className="mt-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar anamnese…"
            className="pl-9"
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} anamnese(s)
      </p>

      {isLoading ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando anamneses…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Nenhuma anamnese encontrada. Crie a primeira com “Nova anamnese”.
        </div>
      ) : (
        <>
          {/* Mobile: a card per anamnese. */}
          <ul className="mt-3 space-y-3 md:hidden">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/coach/anamneses/${a.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ClipboardList className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {a.name}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="base" className="font-medium">
                        {ANAMNESIS_OBJECTIVE_LABELS[a.objective]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {ANAMNESIS_MODALITY_LABELS[a.modality]} · {a.questionCount}{" "}
                        pergunta(s)
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the full TanStack table. */}
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="border-border">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() =>
                      router.push(`/coach/anamneses/${row.original.id}`)
                    }
                    className="cursor-pointer hover:bg-surface-light"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
              {isFetching && " · atualizando…"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-[#475569] transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-[#475569] transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
