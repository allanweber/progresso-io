"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Search, UtensilsCrossed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import {
  DIET_ORIGIN_LABELS,
  formatGrams,
  formatKcal,
  type DietListResponse,
} from "@/lib/diets";

const PAGE_SIZE = 25;

export default function DietsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [includeArchived, setIncludeArchived] = useState(
    () => searchParams.get("archived") === "true",
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (includeArchived) p.set("archived", "true");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [search, includeArchived, pathname, router]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (includeArchived) p.set("includeArchived", "true");
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, includeArchived, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["diets", query],
    queryFn: () => apiFetch<DietListResponse>(`/api/diets?${query}`),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Dietas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte e gerencie dietas reutilizáveis com refeições e alimentos.
          </p>
        </div>
        <Button asChild>
          <Link href="/coach/diets/new">
            <Plus className="size-4" />
            Nova dieta
          </Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar dieta…"
            className="pl-9"
          />
        </div>
        <Select
          value={includeArchived ? "all" : "active"}
          onValueChange={(v) => {
            setIncludeArchived(v === "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-xl sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Somente ativas</SelectItem>
            <SelectItem value="all">Incluir arquivadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} dieta(s)
      </p>

      {isLoading ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando dietas…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Nenhuma dieta encontrada. Crie a primeira com “Nova dieta”.
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {items.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/coach/diets/${d.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UtensilsCrossed className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {d.name}
                      </span>
                      {d.origin === "base" && (
                        <Badge variant="base" className="font-medium">
                          {DIET_ORIGIN_LABELS.base}
                        </Badge>
                      )}
                      {d.archived && (
                        <Badge variant="warn" className="font-medium">
                          arquivada
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {d.mealCount} refeição(ões) · {d.itemCount} alimento(s) ·
                      atualizada{" "}
                      {new Date(d.updatedAt).toLocaleDateString("pt-BR")}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      <span>
                        <span className="font-semibold text-blue-600">
                          {formatGrams(d.totalProtein)}
                        </span>{" "}
                        <span className="text-muted-foreground">Prot</span>
                      </span>
                      <span>
                        <span className="font-semibold text-red-600">
                          {formatGrams(d.totalCarbohydrate)}
                        </span>{" "}
                        <span className="text-muted-foreground">Carb</span>
                      </span>
                      <span>
                        <span className="font-semibold text-amber-600">
                          {formatGrams(d.totalFat)}
                        </span>{" "}
                        <span className="text-muted-foreground">Gord</span>
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-heading text-lg font-bold text-primary">
                      {formatKcal(d.totalKcal)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">kcal</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

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
