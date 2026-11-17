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

  if (clinic && !clinic.onboardingCompletedAt) {
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
