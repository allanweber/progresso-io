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
import { ChevronRight, Plus, Search, X } from "lucide-react";

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

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const columnHelper = createColumnHelper<AnamnesisListItemDto>();

const columns = [
  columnHelper.accessor("name", {
    id: "name",
    header: "Anamnese",
    // The row's only tab stop. `after:absolute after:inset-0` stretches the
    // anchor over the whole `relative` <tr>, so the row opens with a pointer
    // and with a keyboard through one real link — rather than an onClick on a
    // bare <tr>, which is neither focusable nor announced to a screen reader.
    cell: (ctx) => (
      <Link
        href={`/coach/anamneses/${ctx.row.original.id}`}
        className="font-semibold text-foreground transition-colors after:absolute after:inset-0 hover:text-primary-deep"
      >
        {ctx.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("objective", {
    id: "objective",
    header: "Objetivo",
    cell: (ctx) => (
      <Badge variant="neutral" className="font-medium">
        {ANAMNESIS_OBJECTIVE_LABELS[ctx.getValue()]}
      </Badge>
    ),
  }),
  columnHelper.accessor("modality", {
    id: "modality",
    header: "Modalidade",
    cell: (ctx) => (
      <span className="text-body-dense text-text-secondary">
        {ANAMNESIS_MODALITY_LABELS[ctx.getValue()]}
      </span>
    ),
  }),
  columnHelper.accessor("questionCount", {
    id: "questionCount",
    header: "Perguntas",
    cell: (ctx) => (
      <span className="text-body-dense text-text-secondary">
        {ctx.getValue()} em{" "}
        {plural(ctx.row.original.sectionCount, "seção", "seções")}
      </span>
    ),
  }),
  // Who is on this template — the fact that decides whether it is safe to edit
  // or delete one. Zero is stated, not hidden behind a dash.
  columnHelper.accessor("usageCount", {
    id: "usageCount",
    header: "Alunos",
    cell: (ctx) => {
      const n = ctx.getValue();
      return n === 0 ? (
        <span className="text-body-dense text-meta">Nenhum</span>
      ) : (
        <span className="text-body-dense font-medium text-foreground">
          {plural(n, "aluno", "alunos")}
        </span>
      );
    },
  }),
  columnHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Atualizada",
    cell: (ctx) => (
      <span className="text-body-dense text-meta">
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

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  // TanStack Table (required by the frontend rules) returns functions the React
  // Compiler can't memoize — a known, harmless incompatibility for this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const panel =
    "mt-3 rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-headline font-bold text-foreground">
            Anamneses
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
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
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-meta" />
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

      <p className="mt-4 text-label text-muted-foreground">
        {plural(total, "anamnese", "anamneses")}
      </p>

      {isLoading ? (
        <div className={`${panel} p-10 text-center text-body text-muted-foreground`}>
          Carregando anamneses…
        </div>
      ) : isError ? (
        <div className={`${panel} p-10 text-center text-body text-destructive`}>
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        // Two different emptinesses. A search that matched nothing is not a
        // first run, and telling a clinic with six templates to "create the
        // first one" is simply false.
        <div className={`${panel} p-10 text-center`}>
          {search ? (
            <>
              <p className="text-body text-muted-foreground">
                Nenhuma anamnese encontrada para “{search}”.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={clearSearch}
                className="mt-4 h-11 sm:h-10"
              >
                <X className="size-4" />
                Limpar busca
              </Button>
            </>
          ) : (
            <>
              <p className="text-body text-muted-foreground">
                Sua clínica ainda não tem nenhuma anamnese. Monte a primeira e
                use-a com os seus alunos.
              </p>
              <Button asChild className="mt-4">
                <Link href="/coach/anamneses/new">
                  <Plus className="size-4" />
                  Nova anamnese
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: a card per anamnese. The name gets as many lines as it
              needs — templates whose names share a prefix are indistinguishable
              truncated to one. */}
          <ul className="mt-3 space-y-3 md:hidden">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/coach/anamneses/${a.id}`}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      {a.name}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="neutral" className="font-medium">
                        {ANAMNESIS_OBJECTIVE_LABELS[a.objective]}
                      </Badge>
                      <span className="text-label text-muted-foreground">
                        {ANAMNESIS_MODALITY_LABELS[a.modality]} ·{" "}
                        {plural(a.questionCount, "pergunta", "perguntas")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-label text-meta">
                      {a.usageCount === 0
                        ? "Nenhum aluno usa esta anamnese"
                        : `${plural(a.usageCount, "aluno", "alunos")} nesta anamnese`}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 size-5 shrink-0 text-meta" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the full TanStack table. */}
          <div className={`${panel} hidden overflow-x-auto md:block`}>
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
                    className="relative focus-within:bg-surface-light hover:bg-surface-light"
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

          {/* One page needs no pager. */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-label text-muted-foreground">
                Página {page} de {totalPages}
                {isFetching && " · atualizando…"}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-11 sm:h-10"
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-11 sm:h-10"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
