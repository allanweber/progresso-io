"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { CoachDashboardDto } from "@/lib/coach-dashboard";
import { isAtLimit, type PlanUsageDto } from "@/lib/plans";
import { avatarColor, studentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";

/** Today's date as an "Sábado · 2 de agosto" eyebrow (capitalised weekday). */
function useTodayLabel(): string | null {
  // Compute only after mount so the server's timezone never disagrees with the
  // browser's (which would flash a hydration warning on the weekday/day).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
    now,
  );
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(now);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${dayMonth}`;
}

/** A dashboard section: card chrome with a titled header. */
function SectionCard({
  title,
  badge,
  aside,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <h2 className="font-heading text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        {badge}
        {aside ? (
          <span className="ml-auto text-xs text-muted-foreground">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Placeholder body for a section whose feature isn't built yet. */
function ComingSoon() {
  return (
    <div className="px-4 py-9 text-center">
      <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}

export default function CoachDashboardPage() {
  const today = useTodayLabel();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["coach-dashboard"],
    queryFn: () => apiFetch<CoachDashboardDto>("/api/coach/dashboard"),
  });

  // Plan capacity for the "Alunos ativos" tile (shared cache with settings + roster).
  const { data: usage } = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });

  const missingPlans = data?.missingPlans ?? [];
  const pendingCheckins = data?.pendingCheckins ?? [];
  const waWaiting = data?.waWaiting ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#94A3B8]">
            {today ?? " "}
          </div>
          <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-[28px]">
            Sua fila de hoje
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild variant="outline">
            <Link href="/coach/students">Ver todos os alunos</Link>
          </Button>
          {usage && isAtLimit(usage.students.used, usage.students.limit) ? (
            <Button
              disabled
              title={`Limite de ${usage.students.limit} alunos do plano ${usage.planName} atingido. Faça upgrade para adicionar mais.`}
            >
              <Plus className="size-4" />
              Convidar aluno
            </Button>
          ) : (
            <Button asChild>
              <Link href="/coach/students/new">
                <Plus className="size-4" />
                Convidar aluno
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPIs — two real, two coming-soon */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="text-[13px] text-muted-foreground">Alunos ativos</div>
          <div className="mt-1.5 font-heading text-3xl font-bold text-foreground">
            {isLoading ? "…" : (data?.activeCount ?? 0)}
          </div>
          {usage ? (
            <div
              className={cn(
                "text-[11px] font-medium",
                isAtLimit(usage.students.used, usage.students.limit)
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {usage.students.limit === null
                ? `Plano ${usage.planName} · sem limite`
                : `de ${usage.students.limit} · plano ${usage.planName}`}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="text-[13px] text-muted-foreground">Sem treino/dieta</div>
          <div
            className={`mt-1.5 font-heading text-3xl font-bold ${
              missingPlans.length > 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {isLoading ? "…" : missingPlans.length}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="text-[13px] text-muted-foreground">
            Check-ins pendentes
          </div>
          <div
            className={`mt-1.5 font-heading text-3xl font-bold ${
              pendingCheckins.length > 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {isLoading ? "…" : pendingCheckins.length}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="text-[13px] text-muted-foreground">
            WhatsApp aguardando
          </div>
          <div
            className={`mt-1.5 font-heading text-3xl font-bold ${
              waWaiting.length > 0 ? "text-primary" : "text-foreground"
            }`}
          >
            {isLoading ? "…" : waWaiting.length}
          </div>
        </div>
      </div>

      {/* Two-column body, faithful to the mockup */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <SectionCard
            title="Check-ins aguardando resposta"
            badge={
              pendingCheckins.length > 0 ? (
                <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-destructive">
                  {pendingCheckins.length}
                </span>
              ) : undefined
            }
          >
            {isLoading ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </div>
            ) : pendingCheckins.length === 0 ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Nenhum check-in aguardando resposta. 🎉
              </div>
            ) : (
              <ul>
                {pendingCheckins.map((c) => (
                  <li
                    key={c.id}
                    className="border-b border-[#F1F5F9] last:border-0"
                  >
                    <Link
                      href={`/coach/students/${c.studentId}/feedback`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                        style={{ background: avatarColor(c.studentId) }}
                      >
                        {studentInitials(c.firstName, c.lastName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {c.date.slice(8, 10)}/{c.date.slice(5, 7)}
                          {c.weightKg != null ? ` · ${c.weightKg} kg` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-semibold text-[#B45309]">
                        responder
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Peso destoando da meta" aside="últimos 14 dias">
            <ComingSoon />
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Hoje" aside="calendário em breve">
            <ComingSoon />
          </SectionCard>
          <SectionCard title="Esta semana">
            <ComingSoon />
          </SectionCard>
          <SectionCard
            title="WhatsApp aguardando"
            badge={
              waWaiting.length > 0 ? (
                <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {waWaiting.length}
                </span>
              ) : undefined
            }
          >
            {isLoading ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </div>
            ) : waWaiting.length === 0 ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Nenhuma conversa aguardando resposta.
              </div>
            ) : (
              <ul>
                {waWaiting.map((c) => (
                  <li
                    key={c.conversationId}
                    className="border-b border-[#F1F5F9] last:border-0"
                  >
                    <Link
                      href="/coach/whatsapp"
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold uppercase text-white"
                        style={{ background: avatarColor(c.conversationId) }}
                      >
                        {c.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {c.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {c.preview ?? "—"}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* The one real list */}
          <SectionCard
            title="Sem treino ou dieta"
            badge={
              missingPlans.length > 0 ? (
                <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-destructive">
                  {missingPlans.length}
                </span>
              ) : undefined
            }
          >
            {isLoading ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Carregando…
              </div>
            ) : isError ? (
              <div className="px-4 py-9 text-center text-sm text-destructive">
                {(error as Error).message}
              </div>
            ) : missingPlans.length === 0 ? (
              <div className="px-4 py-9 text-center text-sm text-muted-foreground">
                Todos os alunos ativos têm treino e dieta. 🎉
              </div>
            ) : (
              <ul>
                {missingPlans.map((s) => (
                  <li key={s.id} className="border-b border-[#F1F5F9] last:border-0">
                    <Link
                      href={`/coach/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                        style={{ background: avatarColor(s.id) }}
                      >
                        {studentInitials(s.firstName, s.lastName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {s.firstName} {s.lastName}
                        </div>
                        {s.goal ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {s.goal}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {s.missingWorkout ? (
                          <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                            sem treino
                          </span>
                        ) : null}
                        {s.missingDiet ? (
                          <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                            sem dieta
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
