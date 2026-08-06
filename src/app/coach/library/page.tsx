"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/foods/favorite-button";
import { apiFetch } from "@/lib/api-client";
import {
  FOOD_SORTS,
  FOOD_TYPE_LABELS,
  ORIGIN_LABELS,
  type FoodGroupOption,
  type FoodListItemDto,
  type FoodListResponse,
  type FoodOrigin,
  type FoodType,
} from "@/lib/foods";

const PAGE_SIZE = 25;
type Sort = (typeof FOOD_SORTS)[number];

/** Compact per-100 g number: "131", "2,38", or "—" for a missing value. */
function fmt(v: number | null): string {
  if (v === null) return "—";
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return s.replace(".", ",");
}

function originChip(origin: FoodOrigin) {
  return origin === "base"
    ? "bg-[#EEF2FF] text-[#4338CA]"
    : "bg-[#ECFDF5] text-[#047857]";
}

function typeChip(type: FoodType) {
  return type === "ingrediente"
    ? "bg-[#F1F5F9] text-[#475569]"
    : "bg-[#FEF3C7] text-[#92400E]";
}

const columnHelper = createColumnHelper<FoodListItemDto>();

export default function LibraryPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState<FoodType | "">("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("description");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  // Debounce the free-text search so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter/sort change returns to the first page.
  useEffect(() => setPage(1), [search, group, type, favoritesOnly, sort, dir]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (group) p.set("group", group);
    if (type) p.set("type", type);
    if (favoritesOnly) p.set("favorite", "true");
    // A search ranks by relevance, so the column sort only applies when idle.
    if (!search) {
      p.set("sort", sort);
      p.set("dir", dir);
    }
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, group, type, favoritesOnly, sort, dir, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["foods", query],
    queryFn: () => apiFetch<FoodListResponse>(`/api/foods?${query}`),
    placeholderData: keepPreviousData,
  });

  const { data: groups } = useQuery({
    queryKey: ["food-groups"],
    queryFn: () =>
      apiFetch<{ groups: FoodGroupOption[] }>("/api/foods/groups").then(
        (r) => r.groups,
      ),
    staleTime: Infinity,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSort(col: Sort) {
    if (search) return; // sort is disabled while searching (ranked by relevance)
    if (sort === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(col);
      setDir(col === "description" ? "asc" : "desc");
    }
  }

  const sortIcon = (col: Sort) =>
    sort === col && !search ? (
      dir === "asc" ? (
        <ChevronUp className="inline size-3" />
      ) : (
        <ChevronDown className="inline size-3" />
      )
    ) : null;

  const numHeader = (label: string, col: Sort) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className="ml-auto flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {sortIcon(col)}
    </button>
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "favorite",
        header: "",
        cell: (ctx) => (
          <FavoriteButton
            foodId={ctx.row.original.id}
            isFavorite={ctx.row.original.isFavorite}
          />
        ),
      }),
      columnHelper.accessor("description", {
        id: "description",
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort("description")}
            className="flex items-center gap-1 hover:text-foreground"
          >
            Alimento {sortIcon("description")}
          </button>
        ),
        cell: (ctx) => {
          const f = ctx.row.original;
          return (
            <div className="min-w-0">
              <div className="break-words font-medium text-foreground">
                {f.description}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                {f.code && <span className="truncate">{f.code}</span>}
                {f.substituteCount > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-[#6366F1]"
                    title={`${f.substituteCount} substituto(s)`}
                  >
                    <ArrowLeftRight className="size-3" />
                    {f.substituteCount}
                  </span>
                )}
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("groupName", {
        id: "group",
        header: "Grupo",
        cell: (ctx) => (
          <span className="text-[13px] text-[#475569]">{ctx.getValue()}</span>
        ),
      }),
      columnHelper.accessor("type", {
        id: "type",
        header: "Tipo",
        cell: (ctx) => (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeChip(ctx.getValue())}`}
          >
            {FOOD_TYPE_LABELS[ctx.getValue()]}
          </span>
        ),
      }),
      columnHelper.accessor("energyKcal", {
        id: "energyKcal",
        header: () => numHeader("kcal", "energyKcal"),
        cell: (ctx) => (
          <div className="text-right tabular-nums">{fmt(ctx.getValue())}</div>
        ),
      }),
      columnHelper.accessor("protein", {
        id: "protein",
        header: () => numHeader("Prot.", "protein"),
        cell: (ctx) => (
          <div className="text-right tabular-nums text-[#475569]">
            {fmt(ctx.getValue())}
          </div>
        ),
      }),
      columnHelper.accessor("carbohydrate", {
        id: "carbohydrate",
        header: () => numHeader("Carb.", "carbohydrate"),
        cell: (ctx) => (
          <div className="text-right tabular-nums text-[#475569]">
            {fmt(ctx.getValue())}
          </div>
        ),
      }),
      columnHelper.accessor("fat", {
        id: "fat",
        header: () => numHeader("Gord.", "fat"),
        cell: (ctx) => (
          <div className="text-right tabular-nums text-[#475569]">
            {fmt(ctx.getValue())}
          </div>
        ),
      }),
      columnHelper.accessor("origin", {
        id: "origin",
        header: "Origem",
        cell: (ctx) => (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${originChip(ctx.getValue())}`}
          >
            {ORIGIN_LABELS[ctx.getValue()]}
          </span>
        ),
      }),
    ],
    // toggleSort/sortIcon close over search/sort/dir; rebuild when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, sort, dir],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Bibliotecas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte a tabela de composição de alimentos.
          </p>
        </div>
        <Button asChild>
          <Link href="/coach/library/foods/new">
            <Plus className="size-4" />
            Novo alimento
          </Link>
        </Button>
      </div>

      {/* Tabs — only Alimentos for now; more libraries land later. */}
      <div className="mt-6 border-b border-border">
        <span className="inline-block border-b-2 border-primary px-1 pb-2.5 text-sm font-semibold text-primary">
          Alimentos
        </span>
      </div>

      {/* Search + filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar alimento…"
            className="w-full rounded-xl border border-border bg-white py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#475569] outline-none focus:border-primary sm:flex-none"
        >
          <option value="">Todos os grupos</option>
          {(groups ?? []).map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FoodType | "")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#475569] outline-none focus:border-primary sm:flex-none"
        >
          <option value="">Ingredientes e preparações</option>
          <option value="ingrediente">Ingredientes</option>
          <option value="preparacao">Preparações</option>
        </select>
        <button
          type="button"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={
            favoritesOnly
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-[#475569] transition-colors hover:border-primary hover:text-primary"
          }
        >
          <Star
            className={`size-4 ${favoritesOnly ? "fill-amber-400 text-amber-400" : ""}`}
          />
          Favoritos
        </button>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} alimentos · valores por 100 g
      </p>

      {isLoading ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando alimentos…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {favoritesOnly
            ? "Nenhum alimento favoritado ainda. Toque na estrela de um alimento para favoritá-lo."
            : "Nenhum alimento encontrado com esses filtros."}
        </div>
      ) : (
        <>
          {/* Mobile: a card per food. */}
          <ul className="mt-3 space-y-3 md:hidden">
            {items.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/coach/library/foods/${f.id}`}
                  className="block rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-foreground">
                      {f.description}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${originChip(f.origin)}`}
                      >
                        {ORIGIN_LABELS[f.origin]}
                      </span>
                      <FavoriteButton foodId={f.id} isFavorite={f.isFavorite} />
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeChip(f.type)}`}
                    >
                      {FOOD_TYPE_LABELS[f.type]}
                    </span>
                    <span className="min-w-0 truncate text-xs text-[#94A3B8]">
                      {f.groupName}
                    </span>
                    {f.substituteCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#6366F1]">
                        <ArrowLeftRight className="size-3" />
                        {f.substituteCount}
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-[#F1F5F9] pt-3 text-center text-[13px]">
                    {[
                      ["kcal", f.energyKcal],
                      ["Prot.", f.protein],
                      ["Carb.", f.carbohydrate],
                      ["Gord.", f.fat],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <dt className="text-[11px] text-[#94A3B8]">{label}</dt>
                        <dd className="tabular-nums text-[#475569]">
                          {fmt(value as number | null)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the full TanStack table. table-fixed + a colgroup keep
              the numeric columns compact and let the description truncate, so
              the eight columns fit the container instead of overflowing. */}
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-9" />
                <col />
                <col className="w-32" />
                <col className="w-24" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-16" />
              </colgroup>
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
                      router.push(`/coach/library/foods/${row.original.id}`)
                    }
                    className="cursor-pointer border-b border-[#F1F5F9] transition-colors last:border-0 hover:bg-surface-light"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
