"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Dumbbell, Search } from "lucide-react";

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
import type { ClinicOption } from "@/lib/admin";
import {
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  LEVEL_LABELS,
  LEVEL_OPTIONS,
  MUSCLE_LABELS,
  MUSCLE_OPTIONS,
  ORIGIN_LABELS,
  exerciseImageUrl,
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
  admin = false,
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
  /**
   * Admin mode: adds the cross-tenant origin (base/clinic) and clinic filters
   * right after the search box, and sends them to the admin listing endpoint.
   */
  admin?: boolean;
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
  // Admin-only cross-tenant filters (ignored/empty for the coach).
  const [origin, setOrigin] = useState<"" | "base" | "clinic">(
    () => (searchParams.get("origin") as "base" | "clinic" | null) ?? "",
  );
  const [clinic, setClinic] = useState(() => searchParams.get("clinic") ?? "");
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

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then(
        (r) => r.clinics,
      ),
    staleTime: Infinity,
    enabled: admin,
  });

  // Debounce the free-text search so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Mirror the active filters into the URL (replace, no history spam).
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
    if (origin) p.set("origin", origin);
    if (clinic) p.set("clinic", clinic);
    if (includeArchived) p.set("archived", "true");
    if (category) p.set("category", category);
    if (muscle) p.set("muscle", muscle);
    if (equipment) p.set("equipment", equipment);
    if (level) p.set("level", level);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [
    search,
    origin,
    clinic,
    includeArchived,
    category,
    muscle,
    equipment,
    level,
    pathname,
    router,
  ]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (origin) p.set("origin", origin);
    if (clinic) p.set("clinic", clinic);
    if (includeArchived) p.set("archived", "true");
    if (category) p.set("category", category);
    if (muscle) p.set("muscle", muscle);
    if (equipment) p.set("equipment", equipment);
    if (level) p.set("level", level);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [search, origin, clinic, includeArchived, category, muscle, equipment, level, page]);

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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-meta" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar exercício…"
          className="pl-9"
        />
      </div>

      {/* Filters — stack on phones, up to four-up on desktop. In admin mode the
          first two are the cross-tenant origin and clinic selects. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {admin && (
          <>
            <Select
              value={origin || "all"}
              onValueChange={(v: string) =>
                setOrigin(v === "all" ? "" : (v as "base" | "clinic"))
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Origem">
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
              onValueChange={(v: string) =>
                setClinic(v === "all" ? "" : v)
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Clínica">
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
          </>
        )}
        <Select
          value={category || "all"}
          onValueChange={(v: string) =>
            setCategory(v === "all" ? "" : (v as ExerciseCategory))
          }
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
          onValueChange={(v: string) =>
            setMuscle(v === "all" ? "" : (v as Muscle))
          }
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
          onValueChange={(v: string) =>
            setEquipment(v === "all" ? "" : (v as ExerciseEquipment))
          }
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
          onValueChange={(v: string) =>
            setLevel(v === "all" ? "" : (v as ExerciseLevel))
          }
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
        {admin && (
          <Select
            value={includeArchived ? "all" : "active"}
            onValueChange={(v: string) =>
              setIncludeArchived(v === "all")
            }
          >
            <SelectTrigger className="h-10 w-full rounded-xl" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Somente ativos</SelectItem>
              <SelectItem value="all">Incluir arquivados</SelectItem>
            </SelectContent>
          </Select>
        )}
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
              // The card leads with the exercise's first image — the same
              // thumbnail the picker and the fichas show. Without one it keeps
              // the box and shows the dumbbell placeholder, so the grid stays
              // aligned and a missing image is visible at a glance.
              const src = exerciseImageUrl(ex.thumbnail);
              return (
                <li key={ex.id}>
                  <Link
                    href={`${basePath}/${ex.id}`}
                    className="group flex gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
                  >
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-light text-muted-foreground">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          data-testid="exercise-thumb"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Dumbbell className="size-6" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-medium text-foreground">
                        {ex.name}
                      </h3>
                      {ex.clinicName && (
                        <p className="mt-0.5 truncate text-xs text-meta">
                          {ex.clinicName}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {ex.origin === "clinic" && (
                          <Badge variant="clinic" className="font-medium">
                            {ORIGIN_LABELS.clinic}
                          </Badge>
                        )}
                        {ex.archived && (
                          <Badge variant="neutral" className="font-medium">
                            arquivado
                          </Badge>
                        )}
                        <Badge variant="neutral" className="font-medium">
                          {CATEGORY_LABELS[ex.category]}
                        </Badge>
                        <Badge variant="base" className="font-medium">
                          {LEVEL_LABELS[ex.level]}
                        </Badge>
                        {ex.equipment && (
                          <span className="text-xs text-meta">
                            {EQUIPMENT_LABELS[ex.equipment]}
                          </span>
                        )}
                      </div>
                      {ex.primaryMuscles.length > 0 && (
                        <p className="mt-2 truncate text-body-dense text-[#475569]">
                          {ex.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(", ")}
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
