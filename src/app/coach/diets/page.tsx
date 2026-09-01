"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  // The page lives in the URL, and paginating is a real navigation (push), so
  // browser back/forward walk the pages. The filters are mirrored with replace
  // instead — they must never build up history. Page 1 is the default, so it
  // stays out of the URL.
  const page = Number(searchParams.get("page")) || 1;

  function goToPage(next: number) {
    const p = new URLSearchParams(searchParams.toString());
    if (next > 1) p.set("page", String(next));
    else p.delete("page");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // On mount the URL already carries these filters (the state was seeded from
  // it), so skip that pass: writing here would strip the ?page= the coach
  // arrived on. A later write is a real filter change, and it drops the page —
  // new filters start at the first page.
  const firstMirror = useRef(true);
  useEffect(() => {
    if (firstMirror.current) {
      firstMirror.current = false;
      return;
    }
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
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-meta" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar dieta…"
            className="pl-9"
          />
        </div>
        <Select
          value={includeArchived ? "all" : "active"}
          onValueChange={(v) => setIncludeArchived(v === "all")}
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
        <div className="mt-3 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Carregando dietas…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl bg-white p-10 text-center text-sm text-destructive shadow-rest">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground shadow-rest">
          Nenhuma dieta encontrada. Crie a primeira com “Nova dieta”.
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {items.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/coach/diets/${d.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-rest transition-colors hover:border-primary"
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
                        <span className="font-semibold text-info-fg">
                          {formatGrams(d.totalProtein)}
                        </span>{" "}
                        <span className="text-muted-foreground">Prot</span>
                      </span>
                      <span>
                        <span className="font-semibold text-destructive">
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
                    <div className="text-caption text-muted-foreground">kcal</div>
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
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-[#475569] transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
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
