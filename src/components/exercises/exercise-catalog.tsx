"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  PlusCircle,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ExerciseThumb } from "@/components/exercises/exercise-media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import type { AdminExerciseListItemDto, ClinicOption } from "@/lib/admin";
import {
  BODY_PART_LABELS,
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  EXERCISE_BODY_PARTS,
  TARGET_LABELS,
  type ExerciseBodyPart,
  type ExerciseCategory,
  type ExerciseEquipment,
  type ExerciseListItemDto,
  type ExerciseListResponse,
} from "@/lib/exercises";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;
const VIEW_KEY = "exercise-view";
const VIEW_EVENT = "exercise-view-change";

function subscribeView(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEW_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEW_EVENT, onChange);
  };
}

function readView(): View {
  return window.localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
}

type Item = ExerciseListItemDto & Partial<Pick<AdminExerciseListItemDto, "clinicName" | "archived">>;
type Response = Omit<ExerciseListResponse, "items"> & { items: Item[] };
type View = "list" | "cards";

const CHIP =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_OFF = "border-border bg-card text-foreground hover:border-primary";
const CHIP_ON = "border-foreground bg-foreground text-background";
const CARD =
  "group flex rounded-2xl bg-card shadow-rest transition-colors hover:ring-1 hover:ring-primary";
const LAYOUTS: Record<View, { grid: string; card: string; media: string; text: string }> = {
  cards: {
    grid: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
    card: "flex-col p-3",
    media: "aspect-square w-full",
    text: "mt-2",
  },
  list: {
    grid: "flex flex-col gap-2",
    card: "items-center gap-3 p-3",
    media: "size-14",
    text: "",
  },
};

function byLabel<K extends string>(values: K[], labels: Record<K, string>) {
  return [...values].sort((a, b) => labels[a].localeCompare(labels[b], "pt-BR"));
}

export function ExerciseCatalog({
  apiBase,
  basePath,
  title,
  subtitle,
  action,
  createHref,
  admin = false,
}: {
  apiBase: string;
  basePath: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  createHref?: string;
  admin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [bodyPart, setBodyPart] = useState<ExerciseBodyPart | "">(
    () => (searchParams.get("bodyPart") as ExerciseBodyPart | null) ?? "",
  );
  const [category, setCategory] = useState<ExerciseCategory | "">(
    () => (searchParams.get("category") as ExerciseCategory | null) ?? "",
  );
  const [equipment, setEquipment] = useState<ExerciseEquipment | "">(
    () => (searchParams.get("equipment") as ExerciseEquipment | null) ?? "",
  );
  const [origin, setOrigin] = useState<"" | "base" | "clinic">(
    () => (searchParams.get("origin") as "base" | "clinic" | null) ?? "",
  );
  const [clinic, setClinic] = useState(() => searchParams.get("clinic") ?? "");
  const [includeArchived, setIncludeArchived] = useState(
    () => searchParams.get("archived") === "true",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const layout = LAYOUTS[view];

  function toggleView() {
    window.localStorage.setItem(VIEW_KEY, view === "cards" ? "list" : "cards");
    window.dispatchEvent(new Event(VIEW_EVENT));
  }

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics"],
    queryFn: () =>
      apiFetch<{ clinics: ClinicOption[] }>("/api/admin/clinics").then((r) => r.clinics),
    staleTime: Infinity,
    enabled: admin,
  });

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (bodyPart) p.set("bodyPart", bodyPart);
    if (category) p.set("category", category);
    if (equipment) p.set("equipment", equipment);
    if (origin) p.set("origin", origin);
    if (clinic) p.set("clinic", clinic);
    if (includeArchived) p.set("archived", "true");
    return p.toString();
  }, [search, bodyPart, category, equipment, origin, clinic, includeArchived]);

  const firstMirror = useRef(true);
  useEffect(() => {
    if (firstMirror.current) {
      firstMirror.current = false;
      return;
    }
    router.replace(filterQuery ? `${pathname}?${filterQuery}` : pathname, { scroll: false });
  }, [filterQuery, pathname, router]);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [apiBase, filterQuery],
      initialPageParam: 1,
      queryFn: ({ pageParam }) => {
        const p = new URLSearchParams(filterQuery);
        p.set("page", String(pageParam));
        p.set("pageSize", String(PAGE_SIZE));
        return apiFetch<Response>(`${apiBase}?${p.toString()}`);
      },
      getNextPageParam: (last) =>
        last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    });

  const first = data?.pages[0];
  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = first?.total ?? 0;
  const facets = first?.facets;
  const counts = first?.counts;

  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  const narrowed = Boolean(search || bodyPart || category || equipment);
  const sheetCount =
    (category ? 1 : 0) + (equipment ? 1 : 0) + (admin && (origin || clinic || includeArchived) ? 1 : 0);

  const categoryOptions = byLabel(facets?.categories ?? [], CATEGORY_LABELS);
  const equipmentOptions = byLabel(facets?.equipment ?? [], EQUIPMENT_LABELS);

  return (
    <div className="mx-auto max-w-6xl">
      {title && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground" data-testid="exercise-library-count">
        {counts
          ? `${counts.base.toLocaleString("pt-BR")} exercícios com animação${
              counts.clinic
                ? ` + ${counts.clinic.toLocaleString("pt-BR")} ${admin ? "de clínicas" : counts.clinic === 1 ? "próprio" : "próprios"}`
                : ""
            }`
          : " "}
      </p>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-meta" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar exercício…"
            aria-label="Buscar exercício"
            className="h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-24 text-base text-foreground outline-none placeholder:text-meta focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {narrowed && first && (
              <span
                role="status"
                aria-label={`${total} exercícios`}
                className="rounded-full bg-surface-light px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary"
              >
                {total.toLocaleString("pt-BR")}
              </span>
            )}
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Limpar busca"
                className="flex size-8 items-center justify-center rounded-full bg-surface-light text-text-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleView}
          aria-label={view === "cards" ? "Ver em lista" : "Ver em cartões"}
          aria-pressed={view === "cards"}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-foreground hover:border-primary"
        >
          {view === "cards" ? <List className="size-5" /> : <LayoutGrid className="size-5" />}
        </button>
      </div>

      <div
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label="Filtros"
      >
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          className={cn(CHIP, sheetCount ? CHIP_ON : CHIP_OFF)}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {sheetCount ? (
            <span className="rounded-full bg-background px-1.5 text-xs text-foreground">{sheetCount}</span>
          ) : null}
        </button>
        {category && (
          <button
            type="button"
            onClick={() => setCategory("")}
            aria-label={`Remover filtro: ${CATEGORY_LABELS[category]}`}
            className={cn(CHIP, CHIP_ON)}
          >
            {CATEGORY_LABELS[category]}
            <X className="size-3.5" />
          </button>
        )}
        {equipment && (
          <button
            type="button"
            onClick={() => setEquipment("")}
            aria-label={`Remover filtro: ${EQUIPMENT_LABELS[equipment]}`}
            className={cn(CHIP, CHIP_ON)}
          >
            {EQUIPMENT_LABELS[equipment]}
            <X className="size-3.5" />
          </button>
        )}
        {EXERCISE_BODY_PARTS.map((b) => (
          <button
            key={b}
            type="button"
            aria-pressed={bodyPart === b}
            onClick={() => setBodyPart(bodyPart === b ? "" : b)}
            className={cn(CHIP, bodyPart === b ? CHIP_ON : CHIP_OFF)}
          >
            {BODY_PART_LABELS[b]}
            {bodyPart === b && <X className="size-3.5" />}
          </button>
        ))}
      </div>

      <div className={cn("mt-3", layout.grid)}>
        {createHref && (
          <Link
            href={createHref}
            className={cn(CARD, layout.card)}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-xl bg-surface-light text-muted-foreground",
                layout.media,
              )}
            >
              <PlusCircle className="size-6" aria-hidden />
            </div>
            <div className={cn("min-w-0 flex-1", layout.text)}>
              <p className="font-medium text-foreground">Criar exercício próprio</p>
              <p className="text-sm text-muted-foreground">
                Nome, região do corpo e, se quiser, uma foto
              </p>
            </div>
            {view === "list" && <Plus className="size-5 shrink-0 text-foreground" aria-hidden />}
          </Link>
        )}

        {isLoading ? (
          <p className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-rest">
            Carregando exercícios…
          </p>
        ) : isError ? (
          <p className="rounded-2xl bg-card p-10 text-center text-sm text-destructive shadow-rest">
            {(error as Error).message}
          </p>
        ) : items.length === 0 ? (
          <p className="col-span-full rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-rest">
            Nenhum exercício encontrado.
          </p>
        ) : (
          items.map((ex) => (
            <Link
              key={ex.id}
              href={`${basePath}/${ex.id}`}
              data-testid="exercise-row"
              className={cn(CARD, layout.card)}
            >
              <ExerciseThumb
                image={ex.image}
                className={cn("rounded-xl", layout.media)}
              />
              <div className={cn("min-w-0 flex-1", layout.text)}>
                <p className="break-words font-medium leading-snug text-foreground">{ex.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {TARGET_LABELS[ex.target]} · {EQUIPMENT_LABELS[ex.equipment]}
                </p>
                {(ex.origin === "clinic" || ex.archived) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ex.origin === "clinic" && (
                      <Badge variant="clinic" className="font-medium">
                        {ex.clinicName ?? "próprio"}
                      </Badge>
                    )}
                    {ex.archived && (
                      <Badge variant="neutral" className="font-medium">
                        arquivado
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {view === "list" && (
                <ChevronRight className="size-5 shrink-0 text-meta group-hover:text-foreground" aria-hidden />
              )}
            </Link>
          ))
        )}
      </div>

      {hasNextPage && (
        <div ref={moreRef} className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Carregando…" : "Mostrar mais"}
          </Button>
        </div>
      )}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          {admin && (
            <section className="mt-2">
              <h4 className="text-caption font-semibold uppercase tracking-wide text-meta">Origem</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["", "Base e clínicas"],
                    ["base", "Somente base"],
                    ["clinic", "Somente de clínicas"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value || "all"}
                    type="button"
                    aria-pressed={origin === value}
                    onClick={() => setOrigin(value)}
                    className={cn(CHIP, origin === value ? CHIP_ON : CHIP_OFF)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={clinic}
                onChange={(e) => setClinic(e.target.value)}
                aria-label="Clínica"
                className="mt-3 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
              >
                <option value="">Todas as clínicas</option>
                {(clinics ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="mt-3 flex h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Incluir arquivados
              </label>
            </section>
          )}

          {categoryOptions.length > 1 || category ? (
            <section className="mt-2">
              <h4 className="text-caption font-semibold uppercase tracking-wide text-meta">
                Tipo de exercício
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!category}
                  onClick={() => setCategory("")}
                  className={cn(CHIP, !category ? CHIP_ON : CHIP_OFF)}
                >
                  Qualquer tipo
                </button>
                {categoryOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={cn(CHIP, category === c ? CHIP_ON : CHIP_OFF)}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {equipmentOptions.length > 1 || equipment ? (
            <section className="mt-4">
              <h4 className="text-caption font-semibold uppercase tracking-wide text-meta">
                Equipamento
              </h4>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={!equipment}
                  onClick={() => setEquipment("")}
                  className={cn(CHIP, !equipment ? CHIP_ON : CHIP_OFF)}
                >
                  Qualquer equipamento
                </button>
                {equipmentOptions.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={equipment === e}
                    onClick={() => setEquipment(e)}
                    className={cn(CHIP, equipment === e ? CHIP_ON : CHIP_OFF)}
                  >
                    {EQUIPMENT_LABELS[e]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => setFiltersOpen(false)}>Pronto</Button>
            {sheetCount > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setCategory("");
                  setEquipment("");
                  setOrigin("");
                  setClinic("");
                  setIncludeArchived(false);
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
