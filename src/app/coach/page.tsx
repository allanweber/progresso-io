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
import { countPt } from "@/lib/format";
import {
  CALENDAR_TYPE_META,
  WEEKDAY_SHORT_LABELS,
  dayNumber,
  weekdayOf,
  type CalendarItemDto,
} from "@/lib/calendar";
import type { CoachDashboardDto, PendingDraftDto } from "@/lib/coach-dashboard";
import { isAtLimit, type PlanUsageDto } from "@/lib/plans";
import { avatarPalette, studentInitials } from "@/lib/students";
import { cn } from "@/lib/utils";

/**
 * Built once at module scope. `Intl.DateTimeFormat` is one of the pricier
 * constructors on the platform and this page re-renders on every query settle;
 * there is no reason to pay for two of them each time.
 */
const WEEKDAY_FMT = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const DAY_MONTH_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
});

/**
 * Wall-clock, but only after mount, so nothing derived from it can disagree
 * with what the server rendered. `null` until then — every caller below shows
 * nothing rather than a time that might be wrong.
 *
 * Both time-dependent labels on this screen go through here. The drafts card
 * used to call `Date.now()` straight from render, which was safe only by
 * accident: its list is empty during SSR because the query has no data yet.
 * Prefetch that query and it would have become a hydration mismatch.
 */
function useMountedNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);
  return now;
}

/** Today's date as a "Sábado · 2 de agosto" eyebrow (capitalised weekday). */
function todayLabel(now: number): string {
  const d = new Date(now);
  const weekday = WEEKDAY_FMT.format(d);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${DAY_MONTH_FMT.format(d)}`;
}

/**
 * How long an ISO instant has been sitting, in the product's voice. Used by the
 * drafts card, whose `updatedAt` is a true timestamp — so a draft touched this
 * morning says so instead of rounding up to a day it has not waited.
 */
function waitLabel(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
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

/**
 * One id shape for a pile, derived from its own name, so the KPI tile that links
 * to a section and the section itself cannot drift apart.
 */
function pileId(name: string): string {
  return name.replace(/\W+/g, "-").toLowerCase();
}

/** A dashboard section: card chrome with a titled header. */
function SectionCard({
  title,
  badge,
  aside,
  footer,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Names the landmark so screen-reader users can jump between the dashboard's
  // sections instead of hearing anonymous regions.
  const headingId = `section-${pileId(title)}`;
  return (
    <section
      id={`pile-${pileId(title)}`}
      aria-labelledby={headingId}
      // The tiles above link here, and on a phone the piles sit thousands of
      // pixels apart. `scroll-mt` keeps the sticky header off the card title
      // when a tile lands the coach on it.
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
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
      {footer}
    </section>
  );
}

/**
 * Says out loud that the card is showing part of a pile.
 *
 * Every list here is capped server-side, and a cap the screen does not mention
 * is a cap that reads as the whole truth: a coach with 63 pending check-ins was
 * being shown 50 rows under a badge saying "50". The badge now carries the real
 * number, and this line accounts for the difference.
 */
function TruncationNote({
  shown,
  total,
  href,
  action,
}: {
  shown: number;
  total: number;
  /** Only where the rest of the pile genuinely has somewhere to be seen. */
  href?: string;
  action?: string;
}) {
  if (total <= shown) return null;
  return (
    <p className="border-t border-border-light px-4 py-2.5 text-caption text-muted-foreground">
      Mostrando {shown} de {total}.{" "}
      {href && action ? (
        <Link href={href} className="text-primary-deep hover:underline">
          {action}
        </Link>
      ) : null}
    </p>
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

/**
 * A count beside a card title. Danger by default; `tone` softens it.
 *
 * The phrasing is real text held off-screen rather than an `aria-label`: a bare
 * span maps to `role="generic"`, which does not support an accessible name, so
 * the label was being dropped and the count announced as a naked "3".
 *
 * Brand tone inks in Deep Emerald, not Vital Emerald — at `text-label` (12px)
 * `#059669` on the Emerald Wash reads 3.60:1 and fails AA. `#047857` reads
 * 5.24:1. Same rule the danger chip already follows.
 *
 * The noun comes in both forms because the count is almost always 1 on a queue
 * screen, and "1 rascunhos não publicados" is not Portuguese.
 */
function CountBadge({
  count,
  one,
  other,
  tone = "danger",
}: {
  count: number;
  one: string;
  other: string;
  tone?: "danger" | "brand";
}) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-label font-semibold",
        tone === "danger"
          ? "bg-danger-bg text-danger-fg"
          : "bg-primary-light text-primary-deep",
      )}
    >
      <span aria-hidden>{count}</span>
      <span className="sr-only">{countPt(count, one, other)}</span>
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
 *
 * Each tile is its own `aria-live` region and is `aria-atomic`, so when the
 * figure swaps from "…" to a real count the label is re-read with it. A single
 * region around the whole row announced only the changed number — "3", with
 * nothing to attach it to.
 */
function KpiTile({
  label,
  value,
  href,
  tone = "neutral",
  footnote,
}: {
  label: string;
  value: number | null;
  /** Where the tile takes the coach: a pile on this page, or the roster. */
  href: string;
  tone?: "neutral" | "danger" | "brand";
  footnote?: React.ReactNode;
}) {
  const slug = pileId(label);
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      // `relative` for the overlay link below. Hover answers on the border, per
      // the No-Lift Rule — the tile never rises.
      className="relative rounded-2xl border border-border bg-card p-4 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-colors hover:border-primary"
    >
      <dt
        id={`kpi-label-${slug}`}
        className="text-body-dense text-muted-foreground"
      >
        {label}
      </dt>
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
      {/*
        A stretched overlay rather than a wrapping anchor: `<dl>` admits only
        `<dt>`, `<dd>` and `<div>`, so an `<a>` around the pair would be invalid
        and the definition-list semantics the tile depends on would be lost.
        This keeps the whole tile clickable — it is the largest target on the
        screen, and it used to do nothing.

        Named by reference to its own `<dt>` rather than by an `sr-only` child:
        the tile is an `aria-atomic` live region, so any text inside the link
        would be re-announced with the figure on every refetch. Borrowing the
        visible label adds nothing to the region and makes the accessible name
        the words already on screen.
      */}
      <Link
        href={href}
        className="absolute inset-0 rounded-2xl"
        aria-labelledby={`kpi-label-${slug}`}
        aria-describedby={`kpi-${slug}`}
      />
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
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-body-dense font-semibold uppercase"
          style={{
            background: avatarPalette(seed).bg,
            color: avatarPalette(seed).fg,
          }}
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
  const now = useMountedNow();
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

  /*
    How big each pile really is. The lists above are capped server-side, so their
    `.length` measures the page and not the backlog — reading a count off one is
    how the WhatsApp tile came to say 5 while the sidebar said 9+ about the same
    inbox. Tiles and badges read these; the lists render only what arrived, and
    `TruncationNote` accounts for the gap.
  */
  const totals = data?.totals;

  /*
    Capacity rides under the roster figure, and it names its own denominator.
    The cap counts every non-archived aluno — convidados and inativos included —
    while the figure above it counts only the active ones, so the old "de 50"
    under a 45 read as five free slots on a clinic that had none. "vagas" is the
    word that makes two different numbers legible as two different things.

    `usage` is seeded from the server by the coach layout, so this line is in the
    first paint. The nbsp fallback only matters if that seed is ever absent: it
    holds the tile's height so the row cannot grow under the cards below it.
  */
  const atStudentLimit = usage
    ? isAtLimit(usage.students.used, usage.students.limit)
    : false;
  const capacityNote = usage
    ? usage.students.limit === null
      ? `Plano ${usage.planName} · sem limite`
      : `Plano ${usage.planName} · ${usage.students.used}/${usage.students.limit} vagas`
    : "\u00A0";

  // Shared by all three returns below, so a failed load keeps the page title and
  // the two escape hatches (roster, invite) instead of stranding the coach.
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-eyebrow font-bold uppercase text-text-secondary">
          {now ? todayLabel(now) : "\u00A0"}
        </div>
        <h1 className="mt-1 font-heading text-headline font-bold text-foreground">
          Sua fila de hoje
        </h1>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button asChild variant="outline" className="hidden sm:inline-flex">
          <Link href="/coach/students">Ver todos os alunos</Link>
        </Button>
        {usage && atStudentLimit ? (
          <Button asChild>
            <Link href="/coach/settings">
              <Sparkles className="size-4" aria-hidden />
              {/* The full sentence is `whitespace-nowrap` and ~295px wide — it
                  overflowed the content column at 320px. The short form carries
                  the same destination; the tile beside it carries the number. */}
              <span className="sm:hidden">Ver planos</span>
              <span className="hidden sm:inline">
                Limite de {usage.students.limit} alunos · ver planos
              </span>
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/coach/students/new">
              <Plus className="size-4" aria-hidden />
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
          className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_8px_rgba(15,23,42,0.05)]"
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
  //
  // Gated on the roster count, not just the active one: a coach whose three
  // convidados have not accepted yet has an `activeCount` of 0, and telling them
  // to "comece convidando seu primeiro aluno" is telling them to redo the thing
  // they already did. Both numbers come from the same response, so this decision
  // never depends on two queries agreeing — and it cannot silently fall through
  // to six empty cards because the second one failed.
  if (data?.activeCount === 0 && data.rosterCount === 0) {
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
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
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light font-heading text-label font-bold text-primary-deep"
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

      {/* The sizes of the four piles, read in one glance. Each tile is its own
          live region (see KpiTile) rather than one region around the row: with
          the region on the <dl>, only the changed <dd> was announced and a
          screen reader read out a bare "3" with no idea which pile it counted. */}
      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiTile
          label="Alunos ativos"
          value={isLoading ? null : (data?.activeCount ?? 0)}
          href="/coach/students"
          footnote={
            <span
              className={cn(
                "text-caption font-medium",
                // danger-fg, not destructive: this line ships at 11px, where
                // #ef4444 on Paper is 3.76:1. #b91c1c reads 6.47:1. It is the
                // rule the danger chip already follows.
                atStudentLimit ? "text-danger-fg" : "text-muted-foreground",
              )}
            >
              {capacityNote}
            </span>
          }
        />
        <KpiTile
          label="Sem treino/dieta"
          value={isLoading ? null : (totals?.missingPlans ?? 0)}
          href="#pile-sem-treino-ou-dieta"
          tone="danger"
        />
        <KpiTile
          label="Check-ins pendentes"
          value={isLoading ? null : (totals?.pendingCheckins ?? 0)}
          href="#pile-check-ins-aguardando-resposta"
          tone="danger"
        />
        <KpiTile
          label="WhatsApp aguardando"
          value={isLoading ? null : (totals?.waWaiting ?? 0)}
          href="#pile-whatsapp-aguardando"
          tone="brand"
        />
      </dl>
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Check-ins aguardando resposta"
            badge={
              <CountBadge
                count={totals?.pendingCheckins ?? 0}
                one="check-in aguardando resposta"
                other="check-ins aguardando resposta"
              />
            }
            footer={
              <TruncationNote
                shown={pendingCheckins.length}
                total={totals?.pendingCheckins ?? 0}
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
                count={totals?.missingPlans ?? 0}
                one="aluno sem treino ou dieta"
                other="alunos sem treino ou dieta"
              />
            }
            footer={
              <TruncationNote
                shown={missingPlans.length}
                total={totals?.missingPlans ?? 0}
                href="/coach/students"
                action="Ver todos os alunos"
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
                count={totals?.pendingDrafts ?? 0}
                one="rascunho não publicado"
                other="rascunhos não publicados"
                tone="brand"
              />
            }
            footer={
              <TruncationNote
                shown={pendingDrafts.length}
                total={totals?.pendingDrafts ?? 0}
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
                    detail={
                      now
                        ? `${d.kind === "diet" ? "dieta" : "treino"} · editado ${waitLabel(d.updatedAt, now)}`
                        : d.kind === "diet"
                          ? "dieta"
                          : "treino"
                    }
                  >
                    <ActionChip>publicar</ActionChip>
                  </PersonRow>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right column — `min-w-0` for the same reason as the left. */}
        <div className="flex min-w-0 flex-col gap-4">
          <SectionCard
            title="Hoje"
            aside={
              <Link
                href="/coach/calendar"
                className="text-primary-deep hover:underline"
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
                count={totals?.waWaiting ?? 0}
                one="conversa aguardando resposta"
                other="conversas aguardando resposta"
                tone="brand"
              />
            }
            footer={
              <TruncationNote
                shown={waWaiting.length}
                total={totals?.waWaiting ?? 0}
                href="/coach/whatsapp"
                action="Abrir o WhatsApp"
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
