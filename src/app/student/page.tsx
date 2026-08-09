"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Dumbbell,
  LineChart,
  ListChecks,
  LogOut,
  Repeat,
  UtensilsCrossed,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { MacroSummary } from "@/components/diets/diet-detail-view";
import {
  WorkoutExerciseDetail,
  WorkoutSessionsView,
  type GroupInfo,
} from "@/components/workouts/workout-detail-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  formatGrams,
  formatKcal,
  type DietFoodSubstituteDto,
  type DietMacrosDto,
} from "@/lib/diets";
import type {
  StudentDietVersionDto,
  TreeItem,
  TreeMeal,
} from "@/lib/student-diets";
import type { StudentWorkoutVersionDto } from "@/lib/student-workouts";
import type { WorkoutExerciseDto } from "@/lib/workouts";
import type {
  AlunoProfileDto,
  MyDietStateDto,
  MyWorkoutStateDto,
} from "@/lib/student-portal";

/* -------------------------------------------------------------------------- */
/*  Tabs                                                                        */
/* -------------------------------------------------------------------------- */

type TabId = "treino" | "dieta" | "checkin" | "evolucao";

const TABS: {
  id: TabId;
  label: string;
  icon: typeof Dumbbell;
  ready: boolean;
}[] = [
  { id: "treino", label: "Treino", icon: Dumbbell, ready: true },
  { id: "dieta", label: "Dieta", icon: UtensilsCrossed, ready: true },
  { id: "checkin", label: "Check-in", icon: ListChecks, ready: false },
  { id: "evolucao", label: "Evolução", icon: LineChart, ready: false },
];

/* -------------------------------------------------------------------------- */
/*  Small display helpers                                                       */
/* -------------------------------------------------------------------------- */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** "2 unidade" (+ "100 g" as a sub) when a measure was used, else "100 g". */
function quantity(
  grams: number,
  measureLabel: string | null,
  measureGrams: number | null,
): { main: string; sub: string | null } {
  if (measureLabel && measureGrams && measureGrams > 0) {
    const count = Math.round(grams / measureGrams);
    return { main: `${count} ${measureLabel}`, sub: formatGrams(grams) };
  }
  return { main: formatGrams(grams), sub: null };
}

/** Proteína / carbo / gordura proportions, as bar segments. */
function macroRatio(m: DietMacrosDto): { color: string; pct: number }[] {
  const p = m.protein ?? 0;
  const c = m.carbohydrate ?? 0;
  const g = m.fat ?? 0;
  const tot = p + c + g || 1;
  return [
    { color: "bg-blue-600", pct: (p / tot) * 100 },
    { color: "bg-red-600", pct: (c / tot) * 100 },
    { color: "bg-amber-600", pct: (g / tot) * 100 },
  ];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * The food's catalog substitutes not already listed as a coach equivalence
 * (deduped by food), each scaled to the item's portion (catalog grams are per
 * 100 g of the item's food).
 */
function catalogSubs(
  item: TreeItem,
): { foodId: string; description: string; grams: number }[] {
  const added = new Set(item.substitutes.map((s) => s.foodId));
  return (item.foodSubstitutes ?? [])
    .filter((s: DietFoodSubstituteDto) => !added.has(s.foodId))
    .map((s: DietFoodSubstituteDto) => ({
      foodId: s.foodId,
      description: s.description,
      grams: Math.round((item.grams / 100) * s.grams),
    }));
}

/** How many distinct swaps a food offers (coach equivalences + catalog). */
function subCount(item: TreeItem): number {
  return item.substitutes.length + catalogSubs(item).length;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function StudentPortalPage() {
  const [tab, setTab] = useState<TabId>("dieta");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const profile = useQuery({
    queryKey: ["student", "profile"],
    queryFn: () => apiFetch<AlunoProfileDto>("/api/student/profile"),
  });

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // Wipe the cache so the next account never sees this aluno's data.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    }
  }

  const p = profile.data;

  return (
    <div className="min-h-screen bg-[#EEF1F5] text-foreground dark:bg-background">
      {/* Desktop top bar */}
      <header className="hidden h-[60px] items-center gap-3.5 border-b border-border bg-white px-8 lg:flex dark:bg-card">
        <Logo size={30} />
        <span className="font-heading text-base font-semibold">Progresso</span>
        <div className="flex-1" />
        {p?.clinicName ? (
          <span className="text-sm text-muted-foreground">{p.clinicName}</span>
        ) : null}
        <div className="flex size-[34px] items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">
          {p ? initials(p.name) : "…"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sair"
        >
          <LogOut className="size-4" />
        </Button>
      </header>

      {/* Mobile header */}
      <header className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground lg:hidden">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-semibold">
          {p ? initials(p.name) : "…"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">
            {p ? `Oi, ${p.firstName}!` : "…"}
          </div>
          <div className="truncate text-xs opacity-75">
            {p
              ? [p.coachName ? `Coach: ${p.coachName}` : null, p.clinicName]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </div>
        </div>
        {p?.goal ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-primary">
            {p.goal}
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sair"
          className="shrink-0 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
        >
          <LogOut className="size-5" />
        </Button>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-7 lg:px-6 lg:pb-16">
        <div className="grid items-start gap-6 lg:grid-cols-[262px_1fr]">
          {/* Desktop sidebar */}
          <aside className="sticky top-[88px] hidden flex-col gap-4 lg:flex">
            <div className="rounded-2xl bg-white p-5 text-center shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
              <div className="mx-auto mb-3 flex size-[68px] items-center justify-center rounded-full bg-primary text-[25px] font-semibold text-primary-foreground">
                {p ? initials(p.name) : "…"}
              </div>
              <div className="font-heading text-[17px] font-semibold">
                {p?.name ?? "…"}
              </div>
              {p?.coachName ? (
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  Coach: {p.coachName}
                </div>
              ) : null}
              <div className="text-[12.5px] text-muted-foreground">
                {p?.clinicName ?? ""}
              </div>
              {p?.goal ? (
                <span className="mt-3 inline-block rounded-full bg-primary-light px-3 py-1 text-[11px] font-bold text-primary">
                  {p.goal}
                </span>
              ) : null}
            </div>
            <nav className="flex flex-col gap-0.5 rounded-2xl bg-white p-2 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
                      active
                        ? "bg-primary-light font-semibold text-primary"
                        : "text-slate-600 hover:bg-muted dark:text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-[19px]" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="min-w-0">
            {tab === "dieta" ? (
              <DietTab />
            ) : tab === "treino" ? (
              <WorkoutTab />
            ) : (
              <ComingSoon label={TABS.find((t) => t.id === tab)!.label} />
            )}
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-white lg:hidden dark:bg-card">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 border-t-[2.5px] px-1 pb-[calc(0.7rem+env(safe-area-inset-bottom,0))] pt-2.5 text-[11px] ${
                active
                  ? "border-primary font-bold text-primary"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  "Em breve" placeholder (Treino / Check-in / Evolução)                      */
/* -------------------------------------------------------------------------- */

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="mt-2">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {label}
      </h1>
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
        <p className="text-sm text-muted-foreground">
          Em breve. Assim que seu coach liberar, aparece por aqui.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dieta tab                                                                   */
/* -------------------------------------------------------------------------- */

function DietTab() {
  const [selectedFood, setSelectedFood] = useState<TreeItem | null>(null);
  const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["student", "diet"],
    queryFn: () => apiFetch<MyDietStateDto>("/api/student/diet"),
  });

  if (state.isPending) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (state.isError) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Não foi possível carregar sua dieta. Tente novamente.
      </p>
    );
  }

  const { current, history } = state.data;

  // History rows: every published version except the current active one,
  // newest first. Flat, read-only list (faithful to the design).
  const historyRows = history
    .flatMap((d) =>
      d.versions.map((v) => ({
        versionId: v.versionId,
        version: v.version,
        dietId: d.dietId,
        dietName: d.dietName,
        status: d.status,
        publishedAt: v.publishedAt,
      })),
    )
    .filter(
      (r) =>
        !(
          current &&
          r.dietId === current.dietId &&
          r.version === current.version
        ),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (!current && historyRows.length === 0) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dieta
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem uma dieta. Assim que seu coach publicar, ela
            aparece aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {current ? (
        <>
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2.5">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {current.dietName}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Versão {current.version} · publicada em{" "}
                {formatDate(current.publishedAt)}
              </p>
            </div>
            <Badge className="bg-primary-light font-semibold text-primary">
              v{current.version} vigente
            </Badge>
          </div>

          {/* Total macros + ratio */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
            <MacroSummary totals={current.tree.totals} />
            <RatioBar macros={current.tree.totals} className="mt-3.5" />
          </div>

          {/* Meals */}
          <div className="grid gap-4 lg:grid-cols-2">
            {current.tree.meals.map((meal, mi) => (
              <MealCard key={mi} meal={meal} onOpenFood={setSelectedFood} />
            ))}
          </div>
        </>
      ) : (
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dieta
        </h1>
      )}

      {/* History */}
      {historyRows.length > 0 ? (
        <section className="mt-8 border-t border-border pt-5">
          <h2 className="mb-3 font-heading text-[15px] font-semibold text-muted-foreground">
            Dietas anteriores
          </h2>
          <div className="flex flex-col gap-2.5">
            {historyRows.map((r) => (
              <button
                key={r.versionId}
                onClick={() => setHistoryVersionId(r.versionId)}
                className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 text-left shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/40 dark:bg-card"
              >
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-slate-800 font-heading text-[12.5px] font-bold text-white">
                  v{r.version}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">
                    {r.dietName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.status === "archived" ? "Arquivada" : "Ativa"} · publicada
                    em {formatDate(r.publishedAt)}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <FoodDetailDialog
        item={selectedFood}
        onClose={() => setSelectedFood(null)}
      />
      <HistoryVersionDialog
        versionId={historyVersionId}
        onClose={() => setHistoryVersionId(null)}
      />
    </div>
  );
}

/** The P/C/G distribution bar. */
function RatioBar({
  macros,
  className = "",
}: {
  macros: DietMacrosDto;
  className?: string;
}) {
  return (
    <div className={`flex h-1.5 overflow-hidden rounded bg-muted ${className}`}>
      {macroRatio(macros).map((seg, i) => (
        <div key={i} className={seg.color} style={{ width: `${seg.pct}%` }} />
      ))}
    </div>
  );
}

/** One meal: header + clickable food rows + per-meal macro footer. */
function MealCard({
  meal,
  onOpenFood,
}: {
  meal: TreeMeal;
  onOpenFood: (item: TreeItem) => void;
}) {
  return (
    <div className="self-start overflow-hidden rounded-2xl bg-white shadow-[0_1px_12px_rgba(15,23,42,0.06)] dark:bg-card">
      <div className="flex items-baseline gap-2.5 border-b border-[#EEF2F7] px-[18px] py-3.5 dark:border-border">
        <span className="font-heading text-[15px] font-semibold">
          {meal.name}
        </span>
        {meal.time ? (
          <span className="text-xs text-muted-foreground">{meal.time}</span>
        ) : null}
      </div>
      {meal.items.map((item, ii) => {
        const q = quantity(item.grams, item.measureLabel, item.measureGrams);
        return (
          <button
            key={ii}
            onClick={() => onOpenFood(item)}
            className="flex w-full items-start gap-3 border-b border-[#F4F6FA] px-[18px] py-3 text-left text-[13px] transition-colors last:border-b-0 hover:bg-muted/40 dark:border-border"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">
                {item.description}
              </div>
              {subCount(item) > 0 ? (
                <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700">
                  <Repeat className="size-3 shrink-0" />
                  <span>
                    {subCount(item)}{" "}
                    {subCount(item) === 1 ? "substituição" : "substituições"}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="whitespace-nowrap text-[13.5px] font-bold text-foreground">
                {q.main}
              </div>
              {q.sub ? (
                <div className="mt-px text-[11px] text-muted-foreground">
                  {q.sub}
                </div>
              ) : null}
              {item.macros.energyKcal !== null ? (
                <div className="mt-px text-[11px] text-muted-foreground/70">
                  {formatKcal(item.macros.energyKcal)} kcal
                </div>
              ) : null}
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 self-center text-muted-foreground" />
          </button>
        );
      })}
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 bg-muted/30 px-[18px] py-2.5 dark:bg-muted/10">
        <MacroSummary totals={meal.totals} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Food-detail dialog (macros + distribution + substitutions)                 */
/* -------------------------------------------------------------------------- */

function FoodDetailDialog({
  item,
  onClose,
}: {
  item: TreeItem | null;
  onClose: () => void;
}) {
  const macroCards = item
    ? [
        {
          label: "Calorias",
          value: formatKcal(item.macros.energyKcal),
          unit: "kcal",
          color: "text-primary",
          bg: "bg-primary-light",
        },
        {
          label: "Proteínas",
          value: formatGrams(item.macros.protein),
          unit: "",
          color: "text-blue-600",
          bg: "bg-blue-50 dark:bg-blue-950/40",
        },
        {
          label: "Carboidratos",
          value: formatGrams(item.macros.carbohydrate),
          unit: "",
          color: "text-red-600",
          bg: "bg-red-50 dark:bg-red-950/40",
        },
        {
          label: "Gorduras",
          value: formatGrams(item.macros.fat),
          unit: "",
          color: "text-amber-600",
          bg: "bg-amber-50 dark:bg-amber-950/40",
        },
      ]
    : [];
  const q = item
    ? quantity(item.grams, item.measureLabel, item.measureGrams)
    : null;

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[520px]">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg">
                {item.description}
              </DialogTitle>
              <p className="text-[12.5px] text-muted-foreground">
                Porção: {q!.main}
                {q!.sub ? ` · ${q!.sub}` : ""}
              </p>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {macroCards.map((mc) => (
                <div key={mc.label} className={`rounded-xl p-3.5 ${mc.bg}`}>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`font-heading text-[22px] font-bold ${mc.color}`}
                    >
                      {mc.value}
                    </span>
                    {mc.unit ? (
                      <span
                        className={`text-xs font-semibold opacity-80 ${mc.color}`}
                      >
                        {mc.unit}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs font-medium text-muted-foreground">
                    {mc.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-white p-3.5 shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Distribuição de macros
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-muted">
                {macroRatio(item.macros).map((seg, i) => (
                  <div
                    key={i}
                    className={seg.color}
                    style={{ width: `${seg.pct}%` }}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-3.5 text-[11.5px] font-semibold">
                <span className="text-blue-600">● Proteína</span>
                <span className="text-red-600">● Carbo</span>
                <span className="text-amber-600">● Gordura</span>
              </div>
            </div>

            {subCount(item) > 0 ? (
              <div>
                <div className="mb-2 font-heading text-[15px] font-semibold">
                  Substituições equivalentes
                </div>
                <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card">
                  {/* Coach-defined equivalences (already scaled, may use a measure). */}
                  {item.substitutes.map((s, si) => {
                    const sq = quantity(
                      s.grams,
                      s.measureLabel,
                      s.measureGrams,
                    );
                    return (
                      <div
                        key={`e${si}`}
                        className="flex items-center gap-2 border-b border-[#F4F6FA] px-3.5 py-3 text-[13px] text-amber-700 last:border-b-0 dark:border-border"
                      >
                        <Repeat className="size-3.5 shrink-0" />
                        <span>
                          ≈ {sq.main} {s.description}
                        </span>
                      </div>
                    );
                  })}
                  {/* Catalog substitutes (scaled to the portion). */}
                  {catalogSubs(item).map((s) => (
                    <div
                      key={`c${s.foodId}`}
                      className="flex items-center gap-2 border-b border-[#F4F6FA] px-3.5 py-3 text-[13px] text-amber-700 last:border-b-0 dark:border-border"
                    >
                      <Repeat className="size-3.5 shrink-0" />
                      <span>
                        ≈ {formatGrams(s.grams)} {s.description}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  History version dialog (flat, read-only)                                    */
/* -------------------------------------------------------------------------- */

function HistoryVersionDialog({
  versionId,
  onClose,
}: {
  versionId: string | null;
  onClose: () => void;
}) {
  const version = useQuery({
    queryKey: ["student", "diet", "version", versionId],
    queryFn: () =>
      apiFetch<StudentDietVersionDto>(
        `/api/student/diet/versions/${versionId}`,
      ),
    enabled: versionId !== null,
  });

  return (
    <Dialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {version.data
              ? `${version.data.dietName} · v${version.data.version}`
              : "Dieta"}
          </DialogTitle>
          {version.data ? (
            <p className="text-[12.5px] text-muted-foreground">
              Publicada em {formatDate(version.data.publishedAt)}
            </p>
          ) : null}
        </DialogHeader>

        {version.isPending && versionId ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : version.isError ? (
          <p className="text-sm text-red-600">
            Não foi possível carregar esta versão.
          </p>
        ) : version.data ? (
          <div className="flex flex-col gap-3.5">
            {version.data.tree.meals.map((meal, mi) => (
              <div
                key={mi}
                className="overflow-hidden rounded-xl bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)] dark:bg-card"
              >
                <div className="border-b border-[#EEF2F7] px-4 py-3 font-heading text-sm font-semibold dark:border-border">
                  {meal.name}
                  {meal.time ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {meal.time}
                    </span>
                  ) : null}
                </div>
                {meal.items.map((item, ii) => {
                  const q = quantity(
                    item.grams,
                    item.measureLabel,
                    item.measureGrams,
                  );
                  return (
                    <div
                      key={ii}
                      className="flex items-center justify-between gap-2.5 border-b border-[#F4F6FA] px-4 py-2.5 text-[12.5px] last:border-b-0 dark:border-border"
                    >
                      <span className="font-medium text-foreground">
                        {item.description}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-semibold text-muted-foreground">
                        {q.main}
                        {q.sub ? ` · ${q.sub}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Versão arquivada · somente leitura.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Treino tab                                                                  */
/* -------------------------------------------------------------------------- */

function WorkoutTab() {
  const [detail, setDetail] = useState<{
    exercise: WorkoutExerciseDto;
    group: GroupInfo | null;
  } | null>(null);
  const [historyVersionId, setHistoryVersionId] = useState<string | null>(null);

  const state = useQuery({
    queryKey: ["student", "workout"],
    queryFn: () => apiFetch<MyWorkoutStateDto>("/api/student/workout"),
  });

  if (state.isPending) {
    return <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>;
  }
  if (state.isError) {
    return (
      <p className="mt-8 text-sm text-red-600">
        Não foi possível carregar seu treino. Tente novamente.
      </p>
    );
  }

  const { current, history } = state.data;

  const historyRows = history
    .flatMap((w) =>
      w.versions.map((v) => ({
        versionId: v.versionId,
        version: v.version,
        workoutId: w.workoutId,
        workoutName: w.workoutName,
        status: w.status,
        publishedAt: v.publishedAt,
      })),
    )
    .filter(
      (r) =>
        !(
          current &&
          r.workoutId === current.workoutId &&
          r.version === current.version
        ),
    )
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (!current && historyRows.length === 0) {
    return (
      <div className="mt-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Treino
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-white/60 p-10 text-center dark:bg-card/60">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem um treino. Assim que seu coach publicar, ele
            aparece aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {current ? (
        <>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2.5">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {current.workoutName}
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Versão {current.version} · publicada em{" "}
                {formatDate(current.publishedAt)}
              </p>
            </div>
            <Badge className="bg-primary-light font-semibold text-primary">
              v{current.version} vigente
            </Badge>
          </div>

          <WorkoutSessionsView
            sessions={current.sessions}
            onExerciseClick={(exercise, group) => setDetail({ exercise, group })}
          />
        </>
      ) : (
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Treino
        </h1>
      )}

      {historyRows.length > 0 ? (
        <section className="mt-8 border-t border-border pt-5">
          <h2 className="mb-3 font-heading text-[15px] font-semibold text-muted-foreground">
            Treinos anteriores
          </h2>
          <div className="flex flex-col gap-2.5">
            {historyRows.map((r) => (
              <button
                key={r.versionId}
                onClick={() => setHistoryVersionId(r.versionId)}
                className="flex items-center gap-3.5 rounded-xl bg-white p-3.5 text-left shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:bg-muted/40 dark:bg-card"
              >
                <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-slate-800 font-heading text-[12.5px] font-bold text-white">
                  v{r.version}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">
                    {r.workoutName}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.status === "archived" ? "Arquivado" : "Ativo"} · publicado
                    em {formatDate(r.publishedAt)}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <WorkoutExerciseDetail
        exercise={detail?.exercise ?? null}
        group={detail?.group ?? null}
        onClose={() => setDetail(null)}
      />
      <WorkoutHistoryDialog
        versionId={historyVersionId}
        onClose={() => setHistoryVersionId(null)}
      />
    </div>
  );
}

function WorkoutHistoryDialog({
  versionId,
  onClose,
}: {
  versionId: string | null;
  onClose: () => void;
}) {
  const version = useQuery({
    queryKey: ["student", "workout", "version", versionId],
    queryFn: () =>
      apiFetch<StudentWorkoutVersionDto>(
        `/api/student/workout/versions/${versionId}`,
      ),
    enabled: versionId !== null,
  });

  return (
    <Dialog open={versionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            {version.data
              ? `${version.data.workoutName} · v${version.data.version}`
              : "Treino"}
          </DialogTitle>
          {version.data ? (
            <p className="text-[12.5px] text-muted-foreground">
              Publicado em {formatDate(version.data.publishedAt)}
            </p>
          ) : null}
        </DialogHeader>

        {version.isPending && versionId ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : version.isError ? (
          <p className="text-sm text-red-600">
            Não foi possível carregar esta versão.
          </p>
        ) : version.data ? (
          <div className="flex flex-col gap-3.5">
            <WorkoutSessionsView sessions={version.data.sessions} />
            <p className="text-xs text-muted-foreground">
              Versão arquivada · somente leitura.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
