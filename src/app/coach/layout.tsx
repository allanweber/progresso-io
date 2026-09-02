import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/session";
import { clinics, plans } from "@/server/dal";
import { getPlanUsage } from "@/server/plan-usage";
import { requireClinic } from "@/server/tenant";

/**
 * Guards the entire /coach subtree. Every page under it — now and in the
 * future — is coach-only; alunos and admins are redirected to their own area.
 *
 * A **brand-new** clinic is sent to the setup guide first, from ANY /coach path:
 * a coach who follows a deep link out of an e-mail meets the guide once and
 * every link works normally afterwards. The guide lives at `/onboarding`,
 * outside this subtree, precisely so this redirect cannot loop onto itself — a
 * server layout has no pathname to exclude with. Skipping it stamps the flag
 * too, so nobody is asked twice.
 *
 * "Brand-new" means BOTH flags are unset. `starters_seeded_at` is the second
 * condition on purpose: an existing clinic already has its starters, so it
 * predates the guide and must never be pulled into it — and reading that
 * directly means an established clinic is safe even where migration 0040's
 * backfill never ran (a schema pushed with `drizzle-kit push` applies the column
 * without the UPDATE). Nobody who has been using the product gets ambushed by a
 * setup wizard; they reach it deliberately, from Configurações.
 *
 * This also replaces the fire-and-forget starter seed that used to run here: the
 * guide is now the only path that imports starters, because it is the only one
 * that can ask the coach which ones they want.
 *
 * Plan usage is fetched here too and handed down as the shell's query seed. It
 * is the same payload `/api/coach/plan-usage` returns, so the client query hits
 * a warm cache instead of a round-trip — which is what stops the billing banner
 * and the dashboard's capacity footnote from inserting themselves after first
 * paint and shoving the page down. All four reads run in one `Promise.all`, so
 * this costs the layout latency, not four round-trips.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["coach"]);
  const ctx = await requireClinic();
  const [clinic, calendar, whatsapp, planUsage] = await Promise.all([
    clinics.getClinic(ctx),
    plans.canUseCalendar(ctx),
    plans.canUseWhatsapp(ctx),
    getPlanUsage(ctx),
  ]);

  if (clinic && !clinic.onboardingCompletedAt && !clinic.startersSeededAt) {
    redirect("/onboarding");
  }

  return (
    <DashboardShell
      user={session.user}
      capabilities={{ calendar, whatsapp }}
      initialPlanUsage={planUsage ?? undefined}
    >
      {children}
    </DashboardShell>
  );
}
