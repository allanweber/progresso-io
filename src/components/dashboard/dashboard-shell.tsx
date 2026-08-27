"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Database,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Users,
  X,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { clearAiMemory } from "@/lib/ai-generate-memory";
import { apiFetch } from "@/lib/api-client";
// Deliberately from @/lib/format, NOT @/lib/billing: this shell renders on every
// coach + admin page, and billing pulls in zod, which would land in all of them.
import { countPt, formatBRL, formatDateBR } from "@/lib/format";
import { formatTrialDaysLeft, PLAN_META, type PlanUsageDto } from "@/lib/plans";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { homePathForRole, isAdmin, ROLE_LABELS, type Role } from "@/lib/roles";

type ShellUser = {
  name: string;
  email: string;
  role?: string | null;
};

/** Plan-gated features that toggle chrome (e.g. the Calendar/WhatsApp nav items). */
type ShellCapabilities = {
  calendar?: boolean;
  whatsapp?: boolean;
};

/** Sidebar links for a role. Each area only ever links within itself. */
function navItems(
  role: string | null | undefined,
  capabilities: ShellCapabilities,
) {
  const home = homePathForRole(role);
  const items = [{ href: home, label: "Visão geral", icon: LayoutDashboard }];
  if (role === "coach") {
    items.push({ href: "/coach/students", label: "Alunos", icon: Users });
    // Calendar is a paid-tier feature (Free excluded); hide the entry entirely
    // when the plan doesn't include it.
    if (capabilities.calendar) {
      items.push({
        href: "/coach/calendar",
        label: "Calendário",
        icon: CalendarDays,
      });
    }
    // WhatsApp is a paid-tier feature (Free excluded), gated like the Calendar.
    if (capabilities.whatsapp) {
      items.push({
        href: "/coach/whatsapp",
        label: "WhatsApp",
        icon: MessageCircle,
      });
    }
    items.push({ href: "/coach/diets", label: "Dietas", icon: UtensilsCrossed });
    items.push({ href: "/coach/workouts", label: "Treinos", icon: Dumbbell });
    items.push({
      href: "/coach/anamneses",
      label: "Anamneses",
      icon: ClipboardList,
    });
    // One Biblioteca entry — Alimentos and Exercícios are tabs inside it.
    items.push({ href: "/coach/library", label: "Biblioteca", icon: BookOpen });
    items.push({ href: "/coach/settings", label: "Configurações", icon: Settings });
  }
  if (isAdmin(role)) {
    items.push({ href: "/admin/students", label: "Alunos", icon: Users });
    items.push({ href: "/admin/foods", label: "Alimentos", icon: BookOpen });
    items.push({ href: "/admin/exercises", label: "Exercícios", icon: Dumbbell });
    items.push({ href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle });
    items.push({ href: "/admin/ai", label: "IA", icon: Sparkles });
    items.push({ href: "/admin/maintenance", label: "Manutenção", icon: Database });
    items.push({ href: "/admin/admins", label: "Admins", icon: ShieldCheck });
  }
  return items;
}

/**
 * Chrome shared by every role's dashboard (sidebar + header + sign out). A
 * client component so the active nav item tracks the URL and — the point of the
 * cache rule — sign-out can clear the TanStack Query cache, ensuring no tenant
 * data survives into the next account. The sidebar is a fixed rail on desktop
 * and a header-triggered drawer on mobile.
 */
export function DashboardShell({
  user,
  capabilities = {},
  initialPlanUsage,
  children,
}: {
  user: ShellUser;
  capabilities?: ShellCapabilities;
  /**
   * Plan usage already read on the server by the coach layout. Seeds the query
   * below so the billing banner is present in the first paint instead of
   * inserting itself a round-trip later and pushing the page down. Absent for
   * admin, whose shell has no banner and whose query never runs.
   */
  initialPlanUsage?: PlanUsageDto;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const roleLabel = ROLE_LABELS[user.role as Role] ?? user.role;
  const home = homePathForRole(user.role);
  const items = navItems(user.role, capabilities);

  // WhatsApp sidebar badge: how many conversations await a coach reply. Only
  // polled for a coach whose plan includes WhatsApp (the nav item only exists
  // then); refetched on an interval + focus so the count stays fresh across
  // pages without a manual reload.
  const { data: waWaiting } = useQuery({
    queryKey: ["coach-wa-waiting-count"],
    queryFn: () =>
      apiFetch<{ count: number }>("/api/coach/whatsapp/waiting-count"),
    enabled: user.role === "coach" && !!capabilities.whatsapp,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const waWaitingCount = waWaiting?.count ?? 0;

  // Billing state for the banner below the header: the trial countdown, and any
  // fatura still owed. Collection is manual while the paywall waits on the CNPJ
  // (roadmap item 0 Phase 1), so this is the coach's only in-app nudge to pay.
  const { data: planUsage } = useQuery({
    queryKey: ["coach-plan-usage"],
    queryFn: () => apiFetch<PlanUsageDto>("/api/coach/plan-usage"),
    enabled: user.role === "coach",
    refetchOnWindowFocus: true,
    // Server-rendered seed (see the prop). The dashboard page reads this same
    // key, so its capacity footnote is seeded too and neither surface reflows.
    initialData: initialPlanUsage,
  });

  // One banner at a time, worst news first: an overdue fatura outranks a
  // pending one, which outranks anything about the trial. `null` = say nothing,
  // which is the common case for a healthy paying clinic.
  const billingNotice = (() => {
    if (!planUsage) return null;
    const { trial, openInvoice } = planUsage;
    if (openInvoice?.overdue) {
      return {
        tone: "danger" as const,
        title: `Fatura #${openInvoice.number} vencida.`,
        body: `Venceu em ${formatDateBR(openInvoice.dueDate)} — ${formatBRL(openInvoice.totalCents)}. Regularize para manter os recursos do seu plano.`,
      };
    }
    if (openInvoice) {
      return {
        tone: "warning" as const,
        title: `Fatura #${openInvoice.number} em aberto.`,
        body: `Vence em ${formatDateBR(openInvoice.dueDate)} — ${formatBRL(openInvoice.totalCents)}.`,
      };
    }
    if (trial.expired) {
      return {
        tone: "danger" as const,
        title: "Seu teste grátis terminou.",
        body: "Você voltou ao plano Free (até 3 alunos). Seus alunos atuais continuam ativos — para cadastrar novos e liberar WhatsApp, Agenda e microsite, assine um plano.",
      };
    }
    if (trial.active) {
      return {
        tone: "info" as const,
        title: `Teste grátis — ${formatTrialDaysLeft(trial.daysLeft)}.`,
        body: "Você está com os recursos do plano Solo (até 50 alunos, WhatsApp, Agenda e microsite). Assine para não perder o acesso quando o teste acabar.",
      };
    }
    return null;
  })();

  // "Assinar": pick a plan → the server raises the fatura and returns the Pix
  // copia e cola, so the coach pays without leaving the app. Confirming the
  // money is still manual (roadmap item 0 Phase 2 automates it via webhook).
  const subscribe = useMutation({
    mutationFn: (plan: "solo" | "clinica") =>
      apiFetch<{
        invoice: { number: number; dueDate: string; totalCents: number };
        pixPayload: string | null;
        planName: string;
      }>("/api/coach/subscription", {
        method: "POST",
        body: JSON.stringify({ plan }),
      }),
    onSuccess: () => {
      // The banner reads the open fatura, which now exists.
      queryClient.invalidateQueries({ queryKey: ["coach-plan-usage"] });
    },
  });

  async function copyPix() {
    const payload = subscribe.data?.pixPayload;
    if (!payload) return;
    await navigator.clipboard.writeText(payload);
    setPixCopied(true);
    window.setTimeout(() => setPixCopied(false), 2000);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // Wipe every cached query so the next user never sees this tenant's data.
      queryClient.clear();
      // Same rule, different store: the remembered "Gerar com IA" answers are
      // keyed by aluno and hold their objective, preferences and aversions.
      clearAiMemory();
      router.replace("/login");
      router.refresh();
    }
  }

  // A link matches when the path is it or nested under it (home only on exact).
  // Nested routes share a prefix (e.g. /coach/library and
  // /coach/library/exercises), so the most specific match wins — otherwise the
  // parent would light up alongside the child.
  function matches(href: string) {
    return href === home
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  }
  const activeHref = items
    .map((i) => i.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string) {
    return href === activeHref;
  }

  /** Nav links, shared by the desktop rail and the mobile drawer. */
  function navLinks(onNavigate?: () => void) {
    return items.map(({ href, label, icon: Icon }) => {
      const badge =
        href === "/coach/whatsapp" && waWaitingCount > 0
          ? waWaitingCount > 9
            ? "9+"
            : String(waWaitingCount)
          : null;
      return (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(href) ? "page" : undefined}
          className={
            isActive(href)
              ? "flex items-center gap-2.5 rounded-md bg-primary-light px-3 py-2 font-medium text-primary-deep"
              : "flex items-center gap-2.5 rounded-md px-3 py-2 font-medium text-text-secondary transition-colors hover:bg-secondary"
          }
        >
          <Icon className="size-4" />
          {label}
          {badge ? (
            <>
              {/* Two fixes in one bubble. `aria-label` on a bare span maps to
                  role=generic, which does not support an accessible name — screen
                  readers dropped it and announced a naked "9+"; the phrasing is
                  real off-screen text now. And the fill is Deep Emerald: white on
                  Vital Emerald reads 3.77:1, which fails AA at this 11px. */}
              <span className="ml-auto flex min-w-[18px] items-center justify-center rounded-full bg-primary-deep px-1 text-caption font-semibold text-primary-foreground">
                <span aria-hidden>{badge}</span>
                <span className="sr-only">
                  {countPt(
                    waWaitingCount,
                    "conversa aguardando resposta",
                    "conversas aguardando resposta",
                  )}
                </span>
              </span>
            </>
          ) : null}
        </Link>
      );
    });
  }

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <div className="flex min-h-screen bg-surface-light print:block print:min-h-0 print:bg-white">
        {/* Ten rail links stood between a keyboard user and the content on every
            page. Landmarks technically satisfy 2.4.1; this is the affordance
            people actually reach for. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2.5 focus:text-body focus:font-medium focus:text-primary-deep focus:shadow-[0_8px_40px_rgba(15,23,42,0.15)] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Pular para o conteúdo
        </a>

        {/* Desktop rail */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card px-5 py-6 md:flex print:!hidden">
          <Link href={home} className="mb-8">
            <Logo />
          </Link>
          <nav aria-label="Navegação principal" className="flex flex-col gap-1 text-body">
            {navLinks()}
          </nav>
        </aside>

        {/* Mobile drawer */}
        <SheetContent side="left" className="md:hidden">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="mb-8 flex items-center justify-between">
            <Link href={home} onClick={() => setNavOpen(false)}>
              <Logo />
            </Link>
            <SheetClose
              aria-label="Fechar menu"
              className="flex size-11 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X className="size-5" />
            </SheetClose>
          </div>
          <nav aria-label="Navegação principal" className="flex flex-col gap-1 text-body">
            {navLinks(() => setNavOpen(false))}
          </nav>
        </SheetContent>

        {/* min-w-0 lets this column shrink below its content's intrinsic width,
          so a wide child (e.g. the food table) scrolls inside its own
          container instead of forcing horizontal page overflow on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Height comes from `--header-h` rather than from padding, because the
            notification dropdown pins itself to that same token on mobile. One
            number, one place. */}
        <header className="flex h-[var(--header-h)] items-center justify-between border-b border-border bg-card px-4 sm:px-6 print:hidden">
          <div className="flex items-center gap-2.5 md:hidden">
            {/* 44px on the phone: PRODUCT.md calls thumb-sized targets a
                correctness requirement, and this is the only route to every
                other screen when the rail is a drawer. */}
            <SheetTrigger
              aria-label="Abrir menu"
              className="flex size-11 items-center justify-center rounded-md border-[1.5px] border-input text-text-secondary transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <Logo markOnly />
          </div>
          <div className="ml-auto flex items-center gap-4">
            {user.role === "coach" && <NotificationBell />}
            {/* The name stays on the phone — "am I in the right account?" is
                the question this block exists to answer. Only the e-mail line
                drops, which is what buys the 44px targets their room. */}
            <div className="min-w-0 text-right">
              <div className="truncate text-body font-semibold text-foreground">
                {user.name}
              </div>
              <div className="hidden text-caption text-muted-foreground sm:block">
                {roleLabel} · {user.email}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex size-11 items-center justify-center gap-1.5 rounded-md border-[1.5px] border-input text-body-dense font-medium text-text-secondary transition-colors hover:bg-secondary disabled:opacity-60 sm:size-auto sm:px-3 sm:py-2"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        {billingNotice && (
          <div
            role="status"
            data-testid="billing-banner"
            data-tone={billingNotice.tone}
            className={`flex flex-col gap-2.5 border-b px-4 py-3 text-body-dense sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden ${
              billingNotice.tone === "danger"
                ? "border-red-200 bg-red-50 text-red-800"
                : billingNotice.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-sky-200 bg-sky-50 text-sky-800"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className={`mt-0.5 size-4 shrink-0 ${
                  billingNotice.tone === "danger"
                    ? "text-red-600"
                    : billingNotice.tone === "warning"
                      ? "text-amber-600"
                      : "text-sky-600"
                }`}
              />
              <p>
                <span className="font-semibold">{billingNotice.title}</span>{" "}
                {billingNotice.body}
              </p>
            </div>
            {/* Opens the Pix panel in place. Deliberately NOT a link to the
                contact page: someone ready to pay shouldn't be handed a form. */}
            <button
              type="button"
              onClick={() => setSubscribeOpen(true)}
              className="min-h-11 shrink-0 self-start rounded-md border-[1.5px] border-current px-3 py-1.5 font-medium transition-colors hover:bg-white/60 sm:min-h-0 sm:self-auto"
            >
              Assinar
            </button>
          </div>
        )}

        <Dialog
          open={subscribeOpen}
          onOpenChange={(open) => {
            setSubscribeOpen(open);
            if (!open) subscribe.reset();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Assinar o Progresso IO</DialogTitle>
              <DialogDescription>
                {subscribe.data
                  ? "Pague pelo Pix abaixo. Assim que o pagamento cair, liberamos seu plano."
                  : "Escolha seu plano. Você paga por Pix, aqui mesmo."}
              </DialogDescription>
            </DialogHeader>

            {!subscribe.data ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {(["solo", "clinica"] as const).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    disabled={subscribe.isPending}
                    onClick={() => subscribe.mutate(plan)}
                    className="rounded-md border-[1.5px] border-input p-4 text-left transition-colors hover:border-primary hover:bg-secondary disabled:opacity-60"
                  >
                    <p className="font-semibold text-foreground">
                      {PLAN_META[plan].name}
                    </p>
                    <p className="text-title font-semibold text-foreground">
                      {PLAN_META[plan].price}
                      <span className="text-body-dense font-normal text-muted-foreground">
                        /mês
                      </span>
                    </p>
                    <p className="mt-1 text-body-dense text-muted-foreground">
                      {PLAN_META[plan].desc}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 text-body-dense">
                  <span className="text-muted-foreground">
                    Plano {subscribe.data.planName} · fatura #
                    {subscribe.data.invoice.number}
                  </span>
                  <span className="text-title font-semibold text-foreground">
                    {formatBRL(subscribe.data.invoice.totalCents)}
                  </span>
                </div>

                {subscribe.data.pixPayload ? (
                  <>
                    <p className="text-body-dense font-medium text-foreground">
                      Pix copia e cola
                    </p>
                    <textarea
                      readOnly
                      rows={3}
                      value={subscribe.data.pixPayload}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full resize-none rounded-md border-[1.5px] border-input bg-secondary p-2.5 font-mono text-caption leading-snug text-foreground"
                    />
                    <button
                      type="button"
                      onClick={copyPix}
                      className="min-h-11 w-full rounded-md bg-primary-deep px-4 py-2.5 text-body font-medium text-primary-foreground transition-colors hover:bg-primary-press"
                    >
                      {pixCopied ? "Código copiado ✓" : "Copiar código Pix"}
                    </button>
                    <p className="text-body-dense text-muted-foreground">
                      Cole no app do seu banco. Já avisamos nosso time — assim
                      que o Pix cair, seu plano é liberado. Vence em{" "}
                      {formatDateBR(subscribe.data.invoice.dueDate)}.
                    </p>
                  </>
                ) : (
                  <p className="text-body-dense text-muted-foreground">
                    Sua fatura #{subscribe.data.invoice.number} foi gerada e
                    nosso time já foi avisado — entraremos em contato com as
                    instruções de pagamento.
                  </p>
                )}
              </div>
            )}

            {subscribe.isError && (
              <p className="text-body-dense text-red-700">
                Não foi possível gerar a cobrança. Tente de novo em instantes.
              </p>
            )}
          </DialogContent>
        </Dialog>

        <main
          id="conteudo"
          tabIndex={-1}
          className="flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 print:p-0"
        >
          {children}
        </main>
        </div>
      </div>
    </Sheet>
  );
}
