"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Plus,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  CALENDAR_TYPE_META,
  WEEKDAY_SHORT_LABELS,
  dayNumber,
  weekdayOf,
  type CalendarItemDto,
} from "@/lib/calendar";
import type { CoachDashboardDto, PendingDraftDto } from "@/lib/coach-dashboard";
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

/**
 * How long an ISO instant has been sitting, in the product's voice. Used by the
 * drafts card, whose `updatedAt` is a true timestamp — so a draft touched this
 * morning says so instead of rounding up to a day it has not waited.
 */
function waitLabel(iso: string): string {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  if (ms < 86_400_000) {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return "agora";
    if (minutes < 60) return `há ${minutes} min`;
    return `há ${Math.floor(minutes / 60)} h`;
  }
  const days = Math.floor(ms / 86_400_000);
  if (days === 1) return "ontem";
  return `há ${days} dias`;
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
      {/*
        At 390px the title and its aside fought over one line and both wrapped
        mid-phrase. The aside drops to its own line instead of being hidden.
      */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border px-4 py-3.5">
        <h2
          id={headingId}
          className="font-heading text-subtitle font-semibold text-foreground"
        >
          {title}
        </h2>
        {badge}
        {aside ? (
          <span className="w-full text-label text-muted-foreground sm:ml-auto sm:w-auto">
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** The one line a card shows instead of rows: loading, or nothing to do. */
function CardMessage({
  children,
  busy,
}: {
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <p
      aria-busy={busy || undefined}
      className="px-4 py-9 text-center text-body text-muted-foreground"
    >
      {children}
    </p>
  );
}

/** A count beside a card title. Danger by default; `tone` softens it. */
function CountBadge({
  count,
  label,
  tone = "danger",
}: {
  count: number;
  label: string;
  tone?: "danger" | "brand";
}) {
  if (count === 0) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className={cn(
        "rounded-full px-2.5 py-0.5 text-label font-semibold",
        tone === "danger"
          ? "bg-danger-bg text-danger-fg"
          : "bg-primary-light text-primary",
      )}
    >
      {count}
    </span>
  );
}

/**
 * One KPI tile. Always rendered — a bold 0 is itself the good news, and a row
 * that reflows between loads is worse than one that shows a zero.
 *
 * Marked up as the term/value pair it actually is, so a screen reader announces
 * "Sem treino/dieta, 3" rather than two unrelated strings, and so the figure has
 * a stable handle instead of a position in the box tree.
 */
function KpiTile({
  label,
  value,
  tone = "neutral",
  footnote,
}: {
  label: string;
  value: number | null;
  tone?: "neutral" | "danger" | "brand";
  footnote?: React.ReactNode;
}) {
  const slug = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
      <dt className="text-body-dense text-muted-foreground">{label}</dt>
      <dd
        id={`kpi-${slug}`}
        className={cn(
          "mt-1.5 font-heading text-figure font-bold tabular-nums",
          // A count of zero is never alarming, whatever the tile is about.
          value ? toneClass(tone) : "text-foreground",
        )}
      >
        {value === null ? "…" : value}
      </dd>
      {footnote ? <dd>{footnote}</dd> : null}
    </div>
  );
}

function toneClass(tone: "neutral" | "danger" | "brand"): string {
  if (tone === "danger") return "text-destructive";
  if (tone === "brand") return "text-primary";
  return "text-foreground";
}

/** Avatar + name + one secondary fact: the shape every list row here shares. */
function PersonRow({
  href,
  seed,
  initials,
  name,
  detail,
  children,
}: {
  href: string;
  seed: string;
  initials: string;
  name: string;
  detail?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-b border-border-light last:border-0">
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-light focus-visible:bg-surface-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-body-dense font-semibold uppercase text-white"
          style={{ background: avatarColor(seed) }}
          aria-hidden
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-foreground">
            {name}
          </span>
          {detail ? (
            <span className="block truncate text-body-dense text-muted-foreground">
              {detail}
            </span>
          ) : null}
        </span>
        {children}
      </Link>
    </li>
  );
}

/** The action a row is waiting for, as a word — never colour alone. */
function ActionChip({
  children,
  tone = "warn",
}: {
  children: React.ReactNode;
  tone?: "warn" | "danger";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold",
        tone === "warn"
          ? "bg-warn-bg text-warn-fg"
          : "bg-danger-bg text-danger-fg",
      )}
    >
      {children}
    </span>
  );
}

/** One calendar item in the "Hoje" / "Esta semana" agenda cards. */
function AgendaRow({
  item,
  showDate,
}: {
  item: CalendarItemDto;
  showDate?: boolean;
}) {
  const meta = CALENDAR_TYPE_META[item.type];
  const dateLabel = showDate
    ? `${WEEKDAY_SHORT_LABELS[weekdayOf(item.date)]} ${dayNumber(item.date)}`
    : null;
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
            {[dateLabel, time, student].filter(Boolean).join(" · ")}
          </div>
        </div>
        {item.overdue ? <ActionChip tone="danger">atrasado</ActionChip> : null}
      </div>
    </li>
  );
}

/** Where a draft is edited — the builder for its kind, not the aluno's record. */
function draftHref(d: PendingDraftDto): string {
  return `/coach/students/${d.studentId}/${d.kind === "diet" ? "diet" : "workout"}`;
}

export default function CoachDashboardPage() {
  const today = useTodayLabel();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["coach-dashboard"],
    queryFn: () => apiFetch<CoachDashboardDto>("/api/coach/dashboard"),
  });

  // Plan capacity for the "Alunos ativos" tile (shared cache with settings + roster).
  const { data: usage } = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
  });

  const pendingCheckins = data?.pendingCheckins ?? [];
  const missingPlans = data?.missingPlans ?? [];
  const waWaiting = data?.waWaiting ?? [];
  const pendingDrafts = data?.pendingDrafts ?? [];
  const todayEvents = data?.todayEvents ?? [];
  const weekEvents = data?.weekEvents ?? [];

  // Shared by all three returns below, so a failed load keeps the page title and
  // the two escape hatches (roster, invite) instead of stranding the coach.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-eyebrow uppercase text-text-secondary">
          {today ?? " "}
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold text-foreground sm:text-[28px]">
          Sua fila de hoje
        </h1>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button asChild variant="outline" className="hidden sm:inline-flex">
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

  // A brand-new clinic has nothing in any pile. Six "nothing here" messages
  // teach a coach nothing on the highest-stakes screen of their trial, so the
  // first run names the ritual the whole product is built on instead.
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
            Seu painel reúne tudo que espera por você — check-ins, mensagens e
            planos a publicar. Ele começa aqui.
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
    <div className="mx-auto min-w-0 max-w-6xl">
      {header}

      {/* The sizes of the four piles, read in one glance. */}
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiTile
          label="Alunos ativos"
          value={isLoading ? null : (data?.activeCount ?? 0)}
          footnote={
            usage ? (
              <div
                className={cn(
                  "text-caption font-medium",
                  isAtLimit(usage.students.used, usage.students.limit)
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {usage.students.limit === null
                  ? `Plano ${usage.planName} · sem limite`
                  : `de ${usage.students.limit} · plano ${usage.planName}`}
              </div>
            ) : undefined
          }
        />
        <KpiTile
          label="Sem treino/dieta"
          value={isLoading ? null : missingPlans.length}
          tone="danger"
        />
        <KpiTile
          label="Check-ins pendentes"
          value={isLoading ? null : pendingCheckins.length}
          tone="danger"
        />
        <KpiTile
          label="WhatsApp aguardando"
          value={isLoading ? null : waWaiting.length}
          tone="brand"
        />
      </dl>

      {/*
        Left column is the work you owe an aluno — three lists whose rows carry
        an avatar, a name and a chip, and want the width. Right column is time
        and talk: the agenda and the inbox, which read fine narrow.
      */}
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Check-ins aguardando resposta"
            badge={
              <CountBadge
                count={pendingCheckins.length}
                label="aguardando resposta"
              />
            }
          >
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : pendingCheckins.length === 0 ? (
              <CardMessage>Nenhum check-in aguardando resposta.</CardMessage>
            ) : (
              <ul>
                {pendingCheckins.map((c) => (
                  <PersonRow
                    key={c.id}
                    href={`/coach/students/${c.studentId}/feedback`}
                    seed={c.studentId}
                    initials={studentInitials(c.firstName, c.lastName)}
                    name={`${c.firstName} ${c.lastName}`}
                    detail={`${c.date.slice(8, 10)}/${c.date.slice(5, 7)}${
                      c.weightKg != null ? ` · ${c.weightKg} kg` : ""
                    }`}
                  >
                    <ActionChip>responder</ActionChip>
                  </PersonRow>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Sem treino ou dieta"
            badge={
              <CountBadge
                count={missingPlans.length}
                label="alunos sem treino ou dieta"
              />
            }
          >
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : missingPlans.length === 0 ? (
              <CardMessage>
                Todos os alunos ativos têm treino e dieta.
              </CardMessage>
            ) : (
              <ul>
                {missingPlans.map((s) => (
                  <PersonRow
                    key={s.id}
                    href={`/coach/students/${s.id}`}
                    seed={s.id}
                    initials={studentInitials(s.firstName, s.lastName)}
                    name={`${s.firstName} ${s.lastName}`}
                    detail={s.goal}
                  >
                    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {s.missingWorkout ? (
                        <ActionChip tone="danger">sem treino</ActionChip>
                      ) : null}
                      {s.missingDiet ? (
                        <ActionChip tone="danger">sem dieta</ActionChip>
                      ) : null}
                    </span>
                  </PersonRow>
                ))}
              </ul>
            )}
          </SectionCard>

          {/*
            Drafts are invisible everywhere else: the aluno cannot see them, so
            nothing nags. A plan written and never published is the one kind of
            work that silently expires.
          */}
          <SectionCard
            title="Rascunhos não publicados"
            badge={
              <CountBadge
                count={pendingDrafts.length}
                label="rascunhos não publicados"
                tone="brand"
              />
            }
          >
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : pendingDrafts.length === 0 ? (
              <CardMessage>Nenhum rascunho esperando publicação.</CardMessage>
            ) : (
              <ul>
                {pendingDrafts.map((d) => (
                  <PersonRow
                    key={`${d.kind}:${d.id}`}
                    href={draftHref(d)}
                    seed={d.studentId}
                    initials={studentInitials(d.firstName, d.lastName)}
                    name={`${d.firstName} ${d.lastName}`}
                    detail={`${d.kind === "diet" ? "dieta" : "treino"} · editado ${waitLabel(d.updatedAt)}`}
                  >
                    <ActionChip>publicar</ActionChip>
                  </PersonRow>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Hoje"
            aside={
              <Link
                href="/coach/calendar"
                className="text-primary hover:underline"
              >
                Ver agenda
              </Link>
            }
          >
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : todayEvents.length === 0 ? (
              <CardMessage>Nada agendado para hoje.</CardMessage>
            ) : (
              <ul>
                {todayEvents.map((item) => (
                  <AgendaRow key={item.key} item={item} />
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Esta semana">
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : weekEvents.length === 0 ? (
              <CardMessage>
                Nada agendado para o restante da semana.
              </CardMessage>
            ) : (
              <ul>
                {weekEvents.map((item) => (
                  <AgendaRow key={item.key} item={item} showDate />
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="WhatsApp aguardando"
            badge={
              <CountBadge
                count={waWaiting.length}
                label="conversas aguardando resposta"
                tone="brand"
              />
            }
          >
            {isLoading ? (
              <CardMessage busy>Carregando…</CardMessage>
            ) : waWaiting.length === 0 ? (
              <CardMessage>Nenhuma conversa aguardando resposta.</CardMessage>
            ) : (
              <ul>
                {waWaiting.map((c) => (
                  <PersonRow
                    key={c.conversationId}
                    href={`/coach/whatsapp?c=${c.conversationId}`}
                    seed={c.studentId ?? c.conversationId}
                    initials={c.initials}
                    name={c.name}
                    detail={c.preview ?? "—"}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
