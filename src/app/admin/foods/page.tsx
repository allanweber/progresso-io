"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubstituteBadge } from "@/components/foods/substitute-badge";
import { apiFetch } from "@/lib/api-client";
import type {
  AdminFoodListItemDto,
  AdminFoodListResponse,
  AdminFoodOrigin,
  ClinicOption,
} from "@/lib/admin";
import { FOOD_TYPE_LABELS, type FoodGroupOption, type FoodType } from "@/lib/foods";

const PAGE_SIZE = 25;

/** Compact per-100 g number: "131", "2,38", or "—". */
function fmt(v: number | null): string {
  if (v === null) return "—";
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  return s.replace(".", ",");
}

function originVariant(origin: AdminFoodOrigin): "base" | "clinic" {
  return origin === "base" ? "base" : "clinic";
}

export default function AdminFoodsPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<AdminFoodOrigin | "">("");
  const [clinic, setClinic] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState<FoodType | "">("");
  const [page, setPage] = useState(1);

  // Debounce the search and return to page 1 on a new term. Resetting the page
  // inside the timeout (async) keeps setState out of the synchronous effect body.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change also returns to the first page (done in the handlers).

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (origin) p.set("origin", origin);
    if (clinic) p.set("clinic", clinic);
    if (group) p.set("group", group);
    if (type) p.set("type", type);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, origin, clinic, group, type, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["admin-foods", query],
    queryFn: () => apiFetch<AdminFoodListResponse>(`/api/admin/foods?${query}`),
    placeholderData: keepPreviousData,
  });

  const { data: groups } = useQuery({
    queryKey: ["food-groups", "/api/admin/foods"],
    queryFn: () =>
      apiFetch<{ groups: FoodGroupOption[] }>("/api/admin/foods/groups").then(
        (r) => r.groups,
      ),
    staleTime: Infinity,
  });

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
    staleTime: Infinity,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function ownerLabel(f: AdminFoodListItemDto) {
    return f.origin === "base" ? "base" : (f.clinicName ?? "clínica");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-6 text-primary" strokeWidth={2} />
            <h1 className="font-heading text-2xl font-bold text-foreground">
              Catálogo de alimentos
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Toda a plataforma: base compartilhada e os alimentos próprios de cada
            clínica. Você edita apenas o catálogo base.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/foods/new">
            <Plus className="size-4" />
            Novo alimento base
          </Link>
        </Button>
      </div>

      {/* Search — full width */}
      <div className="relative mt-6 w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar alimento…"
          className="w-full rounded-xl border border-border bg-white py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
        />
      </div>

      {/* Filters */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Select
          value={origin || "all"}
          onValueChange={(v) => {
            setOrigin(v === "all" ? "" : (v as AdminFoodOrigin));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-48 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Base e clínicas</SelectItem>
            <SelectItem value="base">Somente base</SelectItem>
            <SelectItem value="clinic">Somente de clínicas</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={clinic || "all"}
          onValueChange={(v) => {
            setClinic(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-52 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as clínicas</SelectItem>
            {(clinics ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={group || "all"}
          onValueChange={(v) => {
            setGroup(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-52 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {(groups ?? []).map((g) => (
              <SelectItem key={g.slug} value={g.slug}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type || "all"}
          onValueChange={(v) => {
            setType(v === "all" ? "" : (v as FoodType));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1 rounded-xl sm:w-52 sm:flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ingredientes e preparações</SelectItem>
            <SelectItem value="ingrediente">Ingredientes</SelectItem>
            <SelectItem value="preparacao">Preparações</SelectItem>
          </SelectContent>
        </Select>
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
          Nenhum alimento encontrado com esses filtros.
        </div>
      ) : (
        <>
          {/* Mobile: a card per food. */}
          <ul className="mt-3 space-y-3 md:hidden">
            {items.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/admin/foods/${f.id}`}
                  className="block rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-foreground">
                      {f.description}
                    </span>
                    <Badge
                      variant={originVariant(f.origin)}
                      className="shrink-0 font-medium"
                    >
                      {ownerLabel(f)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="neutral" className="font-medium">
                      {FOOD_TYPE_LABELS[f.type]}
                    </Badge>
                    <span className="min-w-0 truncate text-xs text-[#94A3B8]">
                      {f.groupName}
                    </span>
                    <SubstituteBadge count={f.substituteCount} />
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

          {/* Desktop: table. */}
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] md:block">
            <Table className="table-fixed">
              <colgroup>
                <col />
                <col className="w-40" />
                <col className="w-32" />
                <col className="w-24" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
              </colgroup>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Alimento</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">kcal</TableHead>
                  <TableHead className="text-right">Prot.</TableHead>
                  <TableHead className="text-right">Carb.</TableHead>
                  <TableHead className="text-right">Gord.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow
                    key={f.id}
                    onClick={() => router.push(`/admin/foods/${f.id}`)}
                    className="cursor-pointer align-top hover:bg-surface-light"
                  >
                    <TableCell>
                      <div className="break-words font-medium text-foreground">
                        {f.description}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        {f.code && (
                          <span className="text-xs text-[#94A3B8]">{f.code}</span>
                        )}
                        <SubstituteBadge count={f.substituteCount} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={originVariant(f.origin)}
                        className="font-medium"
                      >
                        {ownerLabel(f)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[13px] text-[#475569]">
                      {f.groupName}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#475569]">
                      {FOOD_TYPE_LABELS[f.type]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(f.energyKcal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#475569]">
                      {fmt(f.protein)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#475569]">
                      {fmt(f.carbohydrate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#475569]">
                      {fmt(f.fat)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
