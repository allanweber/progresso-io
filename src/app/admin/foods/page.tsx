"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
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

function originChip(origin: AdminFoodOrigin) {
  return origin === "base"
    ? "bg-[#EEF2FF] text-[#4338CA]"
    : "bg-[#ECFDF5] text-[#047857]";
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

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => setPage(1), [search, origin, clinic, group, type]);

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
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value as AdminFoodOrigin | "")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#475569] outline-none focus:border-primary sm:flex-none"
        >
          <option value="">Base e clínicas</option>
          <option value="base">Somente base</option>
          <option value="clinic">Somente de clínicas</option>
        </select>
        <select
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-[#475569] outline-none focus:border-primary sm:flex-none"
        >
          <option value="">Todas as clínicas</option>
          {(clinics ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${originChip(f.origin)}`}
                    >
                      {ownerLabel(f)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#475569]">
                      {FOOD_TYPE_LABELS[f.type]}
                    </span>
                    <span className="min-w-0 truncate text-xs text-[#94A3B8]">
                      {f.groupName}
                    </span>
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
            <table className="w-full table-fixed text-sm">
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
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-[#94A3B8]">
                  <th className="px-4 py-3">Alimento</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">kcal</th>
                  <th className="px-4 py-3 text-right">Prot.</th>
                  <th className="px-4 py-3 text-right">Carb.</th>
                  <th className="px-4 py-3 text-right">Gord.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => router.push(`/admin/foods/${f.id}`)}
                    className="cursor-pointer border-b border-[#F1F5F9] align-top transition-colors last:border-0 hover:bg-surface-light"
                  >
                    <td className="px-4 py-3">
                      <div className="break-words font-medium text-foreground">
                        {f.description}
                      </div>
                      {f.code && (
                        <div className="text-xs text-[#94A3B8]">{f.code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${originChip(f.origin)}`}
                      >
                        {ownerLabel(f)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#475569]">
                      {f.groupName}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[#475569]">
                      {FOOD_TYPE_LABELS[f.type]}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmt(f.energyKcal)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#475569]">
                      {fmt(f.protein)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#475569]">
                      {fmt(f.carbohydrate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#475569]">
                      {fmt(f.fat)}
                    </td>
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
