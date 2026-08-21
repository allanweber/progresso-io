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
import { apiFetch } from "@/lib/api-client";
// Deliberately from @/lib/format, NOT @/lib/billing: this shell renders on every
// coach + admin page, and billing pulls in zod, which would land in all of them.
import { formatBRL, formatDateBR } from "@/lib/format";
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
  children,
}: {
  user: ShellUser;
  capabilities?: ShellCapabilities;
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
              ? "flex items-center gap-2.5 rounded-[10px] bg-primary-light px-3 py-2 font-medium text-primary"
              : "flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-medium text-[#334155] transition-colors hover:bg-secondary"
          }
        >
          <Icon className="size-4" />
          {label}
          {badge ? (
            <span
              className="ml-auto flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
              aria-label={`${waWaitingCount} conversas aguardando resposta`}
            >
              {badge}
            </span>
          ) : null}
        </Link>
      );
    });
  }

  return (
    <Sheet open={navOpen} onOpenChange={setNavOpen}>
      <div className="flex min-h-screen bg-surface-light print:block print:min-h-0 print:bg-white">
        {/* Desktop rail */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white px-5 py-6 md:flex print:!hidden">
          <Link href={home} className="mb-8">
            <Logo />
          </Link>
          <nav className="flex flex-col gap-1 text-sm">{navLinks()}</nav>
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
              className="flex size-9 items-center justify-center rounded-[10px] text-[#334155] transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X className="size-5" />
            </SheetClose>
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            {navLinks(() => setNavOpen(false))}
          </nav>
        </SheetContent>

        {/* min-w-0 lets this column shrink below its content's intrinsic width,
          so a wide child (e.g. the food table) scrolls inside its own
          container instead of forcing horizontal page overflow on mobile. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2.5 md:hidden">
            <SheetTrigger
              aria-label="Abrir menu"
              className="flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-input text-[#334155] transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <Logo markOnly />
          </div>
          <div className="ml-auto flex items-center gap-4">
            {user.role === "coach" && <NotificationBell />}
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">
                {user.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {roleLabel} · {user.email}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex items-center gap-1.5 rounded-[10px] border-[1.5px] border-input px-3 py-2 text-[13px] font-medium text-[#334155] transition-colors hover:bg-secondary disabled:opacity-60"
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
            className={`flex flex-col gap-2.5 border-b px-6 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between print:hidden ${
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
              className="shrink-0 self-start rounded-[10px] border-[1.5px] border-current px-3 py-1.5 font-medium transition-colors hover:bg-white/60 sm:self-auto"
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
                    className="rounded-[10px] border-[1.5px] border-input p-4 text-left transition-colors hover:border-primary hover:bg-secondary disabled:opacity-60"
                  >
                    <p className="font-semibold text-foreground">
                      {PLAN_META[plan].name}
                    </p>
                    <p className="text-[20px] font-semibold text-foreground">
                      {PLAN_META[plan].price}
                      <span className="text-[13px] font-normal text-muted-foreground">
                        /mês
                      </span>
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {PLAN_META[plan].desc}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">
                    Plano {subscribe.data.planName} · fatura #
                    {subscribe.data.invoice.number}
                  </span>
                  <span className="text-[17px] font-semibold text-foreground">
                    {formatBRL(subscribe.data.invoice.totalCents)}
                  </span>
                </div>

                {subscribe.data.pixPayload ? (
                  <>
                    <p className="text-[13px] font-medium text-foreground">
                      Pix copia e cola
                    </p>
                    <textarea
                      readOnly
                      rows={3}
                      value={subscribe.data.pixPayload}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full resize-none rounded-[10px] border-[1.5px] border-input bg-secondary p-2.5 font-mono text-[11px] leading-snug text-foreground"
                    />
                    <button
                      type="button"
                      onClick={copyPix}
                      className="w-full rounded-[10px] bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                    >
                      {pixCopied ? "Código copiado ✓" : "Copiar código Pix"}
                    </button>
                    <p className="text-[13px] text-muted-foreground">
                      Cole no app do seu banco. Já avisamos nosso time — assim
                      que o Pix cair, seu plano é liberado. Vence em{" "}
                      {formatDateBR(subscribe.data.invoice.dueDate)}.
                    </p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">
                    Sua fatura #{subscribe.data.invoice.number} foi gerada e
                    nosso time já foi avisado — entraremos em contato com as
                    instruções de pagamento.
                  </p>
                )}
              </div>
            )}

            {subscribe.isError && (
              <p className="text-[13px] text-red-700">
                Não foi possível gerar a cobrança. Tente de novo em instantes.
              </p>
            )}
          </DialogContent>
        </Dialog>

        <main className="flex-1 px-6 py-8 print:p-0">{children}</main>
        </div>
      </div>
    </Sheet>
  );
}
