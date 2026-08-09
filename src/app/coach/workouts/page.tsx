"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Dumbbell, Plus, Search } from "lucide-react";

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
import { WORKOUT_ORIGIN_LABELS, type WorkoutListResponse } from "@/lib/workouts";

const PAGE_SIZE = 25;

export default function WorkoutsListPage() {
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
    queryKey: ["workouts", query],
    queryFn: () => apiFetch<WorkoutListResponse>(`/api/workouts?${query}`),
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
            Treinos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte e gerencie programas de treino reutilizáveis com fichas e
            exercícios.
          </p>
        </div>
        <Button asChild>
          <Link href="/coach/workouts/new">
            <Plus className="size-4" />
            Novo treino
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
            placeholder="Buscar treino…"
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
            <SelectItem value="active">Somente ativos</SelectItem>
            <SelectItem value="all">Incluir arquivados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} treino(s)
      </p>

      {isLoading ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando treinos…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Nenhum treino encontrado. Crie o primeiro com “Novo treino”.
        </div>
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/coach/workouts/${w.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Dumbbell className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {w.name}
                      </span>
                      {w.origin === "base" && (
                        <Badge variant="base" className="font-medium">
                          {WORKOUT_ORIGIN_LABELS.base}
                        </Badge>
                      )}
                      {w.archived && (
                        <Badge variant="warn" className="font-medium">
                          arquivado
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {w.sessionCount} ficha(s) · {w.exerciseCount} exercício(s) ·
                      atualizado{" "}
                      {new Date(w.updatedAt).toLocaleDateString("pt-BR")}
                    </div>
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
