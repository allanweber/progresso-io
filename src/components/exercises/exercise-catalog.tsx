"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  exerciseImageUrl,
  LEVEL_LABELS,
  LEVEL_OPTIONS,
  MUSCLE_LABELS,
  MUSCLE_OPTIONS,
  ORIGIN_LABELS,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseLevel,
  type ExerciseListItemDto,
  type ExerciseListResponse,
  type Muscle,
} from "@/lib/exercises";

const PAGE_SIZE = 24;

/** A list row that also carries the admin-only extras (optional for the coach). */
type Item = ExerciseListItemDto & {
  clinicName?: string | null;
  archived?: boolean;
};

type Response = {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * The exercise catalog grid — a searchable, filterable wall of exercise cards.
 * Reused by the coach library and the admin catalog: they differ only in the API
 * endpoint and the detail link base (and the admin listing carries a clinic
 * name). Filters are mirrored into the URL so returning from a detail page
 * restores the exact view.
 */
export function ExerciseCatalog({
  apiBase,
  basePath,
  title,
  subtitle,
  action,
}: {
  /** API listing endpoint, e.g. "/api/exercises" or "/api/admin/exercises". */
  apiBase: string;
  /** Detail link base, e.g. "/coach/library/exercises". */
  basePath: string;
  /**
   * Optional page heading + subtitle. Omit both when the catalog is embedded
   * under a shared header (e.g. the coach's Biblioteca tabs), so there's no
   * duplicate title.
   */
  title?: string;
  subtitle?: string;
  /** Optional right-aligned action next to the title (e.g. "Novo exercício"). */
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") ?? "",
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [category, setCategory] = useState<ExerciseCategory | "">(
    () => (searchParams.get("category") as ExerciseCategory | null) ?? "",
  );
  const [muscle, setMuscle] = useState<Muscle | "">(
    () => (searchParams.get("muscle") as Muscle | null) ?? "",
  );
  const [equipment, setEquipment] = useState<ExerciseEquipment | "">(
    () => (searchParams.get("equipment") as ExerciseEquipment | null) ?? "",
  );
  const [level, setLevel] = useState<ExerciseLevel | "">(
    () => (searchParams.get("level") as ExerciseLevel | null) ?? "",
  );
  const [page, setPage] = useState(1);

  // Debounce the free-text search so we don't refetch on every keystroke; a new
  // search returns to the first page. (Resetting page inside the timeout — not
  // synchronously in an effect body — keeps it clear of the render cascade.)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A select filter change also returns to the first page. Applied in each
  // handler (below) rather than in an effect, so we never setState in an effect
  // body — the pattern the lint config flags.
  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  // Mirror the active filters into the URL (replace, no history spam).
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (category) p.set("category", category);
    if (muscle) p.set("muscle", muscle);
    if (equipment) p.set("equipment", equipment);
    if (level) p.set("level", level);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [search, category, muscle, equipment, level, pathname, router]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (category) p.set("category", category);
    if (muscle) p.set("muscle", muscle);
    if (equipment) p.set("equipment", equipment);
    if (level) p.set("level", level);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, category, muscle, equipment, level, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [apiBase, query],
    queryFn: () => apiFetch<Response | ExerciseListResponse>(`${apiBase}?${query}`),
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => (data?.items ?? []) as Item[], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl">
      {title && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}

      {/* Search — full width on its own row. */}
      <div className="relative mt-6 w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar exercício…"
          className="pl-9"
        />
      </div>

      {/* Filters — stack on phones, up to four-up on desktop. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={category || "all"}
          onValueChange={onFilterChange((v: string) =>
            setCategory(v === "all" ? "" : (v as ExerciseCategory)),
          )}
        >
          <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={muscle || "all"}
          onValueChange={onFilterChange((v: string) =>
            setMuscle(v === "all" ? "" : (v as Muscle)),
          )}
        >
          <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Músculo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os músculos</SelectItem>
            {MUSCLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={equipment || "all"}
          onValueChange={onFilterChange((v: string) =>
            setEquipment(v === "all" ? "" : (v as ExerciseEquipment)),
          )}
        >
          <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Equipamento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os equipamentos</SelectItem>
            {EQUIPMENT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={level || "all"}
          onValueChange={onFilterChange((v: string) =>
            setLevel(v === "all" ? "" : (v as ExerciseLevel)),
          )}
        >
          <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Nível">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            {LEVEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {total.toLocaleString("pt-BR")} exercícios
        {isFetching && " · atualizando…"}
      </p>

      {isLoading ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Carregando exercícios…
        </div>
      ) : isError ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-destructive shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          {(error as Error).message}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-foreground shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          Nenhum exercício encontrado com esses filtros.
        </div>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((ex) => {
              const src = exerciseImageUrl(ex.thumbnail);
              return (
                <li key={ex.id}>
                  <Link
                    href={`${basePath}/${ex.id}`}
                    className="group block overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-light">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={ex.name}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-[#94A3B8]">
                          sem imagem
                        </div>
                      )}
                      {ex.origin === "clinic" && (
                        <Badge
                          variant="clinic"
                          className="absolute left-2 top-2 font-medium"
                        >
                          {ORIGIN_LABELS.clinic}
                        </Badge>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="break-words font-medium text-foreground">
                        {ex.name}
                      </h3>
                      {ex.clinicName && (
                        <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                          {ex.clinicName}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="neutral" className="font-medium">
                          {CATEGORY_LABELS[ex.category]}
                        </Badge>
                        <Badge variant="base" className="font-medium">
                          {LEVEL_LABELS[ex.level]}
                        </Badge>
                        {ex.equipment && (
                          <span className="text-xs text-[#94A3B8]">
                            {EQUIPMENT_LABELS[ex.equipment]}
                          </span>
                        )}
                      </div>
                      {ex.primaryMuscles.length > 0 && (
                        <p className="mt-2 truncate text-[13px] text-[#475569]">
                          {ex.primaryMuscles
                            .map((m) => MUSCLE_LABELS[m])
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
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
