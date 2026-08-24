"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { CALENDAR_TYPE_META, type CalendarItemDto } from "@/lib/calendar";
import {
  QUEUE_KIND_LABELS,
  type CoachDashboardDto,
  type QueueItemDto,
} from "@/lib/coach-dashboard";
import { isAtLimit, type PlanUsageDto } from "@/lib/plans";
import { avatarColor } from "@/lib/students";
import { cn } from "@/lib/utils";

/** How many queue rows show before the coach asks for the rest. */
const VISIBLE_ROWS = 6;

/** A wait this long or longer reads as urgent rather than merely pending. */
const URGENT_DAYS = 7;

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

/** Whole days between an ISO instant and now, floored at 0. */
function daysWaiting(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** "hoje" · "há 1 dia" · "há 12 dias" — the queue's only ranking signal. */
function waitLabel(days: number): string {
  if (days === 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
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
  // Names the landmark so screen-reader users can jump between the dashboard's
  // sections instead of hearing anonymous regions.
  const headingId = `section-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <h2
          id={headingId}
          className="font-heading text-subtitle font-semibold text-foreground"
        >
          {title}
        </h2>
        {badge}
        {aside ? (
          <span className="ml-auto text-label text-muted-foreground">{aside}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function CoachDashboardPage() {
  const today = useTodayLabel();
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["coach-dashboard"],
    queryFn: () => apiFetch<CoachDashboardDto>("/api/coach/dashboard"),
  });

  // Plan capacity for the invite control (shared cache with settings + roster).
  const { data: usage } = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });

  const queue = data?.queue ?? [];
  const queueTotal = data?.queueTotal ?? 0;
  const todayEvents = data?.todayEvents ?? [];
  const shown = expanded ? queue : queue.slice(0, VISIBLE_ROWS);
  const hidden = queueTotal - shown.length;

  // Shared by both returns below, so a failed load keeps the page title and
  // the two escape hatches (roster, invite) instead of stranding the coach.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-eyebrow uppercase text-meta">
          {today ?? " "}
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
          <Button asChild>
            <Link href="/coach/settings">
              <Sparkles className="size-4" aria-hidden />
              Limite de {usage.students.limit} alunos · ver planos
            </Link>
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
  );

  // A failed fetch must never fall through to the empty branches below: a coach
  // on bad signal would read "nothing pending" and put the phone away.
  if (isError) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-border bg-white p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
        >
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="size-8 text-destructive" aria-hidden />
            <div>
              <h2 className="font-heading text-title font-semibold text-foreground">
                Não foi possível carregar seu painel
              </h2>
              <p className="mt-1.5 text-body text-muted-foreground">
                {(error as Error).message}
              </p>
            </div>
            <Button onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw
                className={cn("size-4", isFetching && "animate-spin")}
                aria-hidden
              />
              {isFetching ? "Tentando…" : "Tentar de novo"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // A brand-new clinic has nothing to queue. Six "nothing here" messages teach
  // a coach nothing on the highest-stakes screen of their trial, so the first
  // run names the ritual the whole product is built on instead.
  if (data?.activeCount === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <div className="mt-6 rounded-2xl border border-border bg-white px-6 py-14 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary-light">
            <UserPlus className="size-7 text-primary" aria-hidden />
          </div>
          <h2 className="font-heading text-title font-bold text-foreground">
            Comece convidando seu primeiro aluno
          </h2>
          <p className="mx-auto mt-2 max-w-md text-body text-muted-foreground">
            Sua fila reúne tudo que espera por você — check-ins, mensagens e
            planos a publicar. Ela começa aqui.
          </p>
          <ol className="mx-auto mt-8 flex max-w-lg flex-col gap-4 text-left">
            {[
              {
                title: "Convide o aluno",
                body: "Ele recebe o convite no WhatsApp e não precisa instalar nada.",
              },
              {
                title: "Monte o treino ou a dieta",
                body: "Fica como rascunho enquanto você trabalha — só você vê.",
              },
              {
                title: "Publique",
                body: "O aluno é avisado no WhatsApp e passa a ver a versão publicada.",
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light font-heading text-label font-bold text-primary"
                >
                  {i + 1}
                </span>
                <div>
                  <div className="text-body font-semibold text-foreground">
                    {step.title}
                  </div>
                  <div className="text-body-dense text-muted-foreground">
                    {step.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Button asChild>
              <Link href="/coach/students/new">
                <Plus className="size-4" aria-hidden />
                Convidar aluno
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-4">
      {header}

      {/* The queue — everything the coach owes someone, longest wait first. */}
      <SectionCard
        title="Precisa de você"
        badge={
          queueTotal > 0 ? (
            <span
              aria-label={`${queueTotal} itens aguardando`}
              className="rounded-full bg-danger-bg px-2.5 py-0.5 text-label font-semibold text-danger-fg"
            >
              {queueTotal}
            </span>
          ) : undefined
        }
      >
        {isLoading ? (
          <ul>
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="border-b border-border-light last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="size-9 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded-full bg-muted" />
                    <div className="h-2.5 w-24 rounded-full bg-border-light" />
                  </div>
                </div>
              </li>
            ))}
            <li className="sr-only">Carregando sua fila…</li>
          </ul>
        ) : queue.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-heading text-subtitle font-semibold text-foreground">
              Tudo em dia
            </p>
            <p className="mt-1 text-body text-muted-foreground">
              Nada aguardando resposta agora.
            </p>
          </div>
        ) : (
          <>
            <ul>
              {shown.map((item) => (
                <QueueRow key={item.key} item={item} />
              ))}
            </ul>
            {hidden > 0 ? (
              <div className="border-t border-border-light px-4 py-2.5 text-center">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="rounded-[10px] px-3 py-1.5 text-body-dense font-semibold text-text-secondary transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Ver todos ({queueTotal})
                </button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      {/* Today's agenda. The week lives on the calendar page. */}
      <SectionCard
        title="Agenda de hoje"
        aside={
          <Link
            href="/coach/calendar"
            className="transition-colors hover:text-primary"
          >
            ver agenda
          </Link>
        }
      >
        {isLoading ? (
          <div className="px-4 py-9 text-center text-body text-muted-foreground">
            Carregando…
          </div>
        ) : todayEvents.length === 0 ? (
          <div className="px-4 py-9 text-center text-body text-muted-foreground">
            Nada agendado para hoje.
          </div>
        ) : (
          <ul>
            {todayEvents.map((item) => (
              <AgendaRow key={item.key} item={item} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/**
 * One row of the merged queue. The kind is a text chip, never a colour alone;
 * the wait is the only thing that turns red, and only past {@link URGENT_DAYS}.
 */
function QueueRow({ item }: { item: QueueItemDto }) {
  const days = daysWaiting(item.waitingSince);
  const urgent = days >= URGENT_DAYS;
  return (
    <li className="border-b border-border-light last:border-0">
      <Link
        href={item.href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light"
      >
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-body-dense font-semibold text-white"
          style={{ background: avatarColor(item.avatarSeed) }}
          aria-hidden
        >
          {item.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-foreground">
            {item.name}
          </div>
          <div className="truncate text-body-dense text-muted-foreground">
            {item.detail ?? QUEUE_KIND_LABELS[item.kind]}
          </div>
        </div>
        <span className="hidden shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-label font-semibold text-text-secondary sm:inline">
          {QUEUE_KIND_LABELS[item.kind]}
        </span>
        <time
          dateTime={item.waitingSince}
          className={cn(
            "shrink-0 text-body-dense font-medium tabular-nums",
            urgent ? "text-danger-fg" : "text-meta",
          )}
        >
          {waitLabel(days)}
        </time>
        <ChevronRight className="size-4 shrink-0 text-meta" aria-hidden />
      </Link>
    </li>
  );
}

/** One calendar item in the "Agenda de hoje" card. */
function AgendaRow({ item }: { item: CalendarItemDto }) {
  const meta = CALENDAR_TYPE_META[item.type];
  const time = item.startTime ?? "dia todo";
  const student = item.source === "manual" ? item.studentName : null;
  return (
    <li className="border-b border-border-light last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: meta.accent }}
          aria-hidden
        />
        <span className="sr-only">{meta.label}:</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-foreground">
            {item.title}
          </div>
          <div className="truncate text-body-dense text-muted-foreground">
            {[time, student].filter(Boolean).join(" · ")}
          </div>
        </div>
        {item.overdue ? (
          <span className="shrink-0 rounded-full bg-danger-bg px-2.5 py-0.5 text-label font-semibold text-danger-fg">
            atrasado
          </span>
        ) : null}
      </div>
    </li>
  );
}
