import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StartersEnsure } from "@/components/dashboard/starters-ensure";
import { requireRole } from "@/lib/session";
import { clinics, plans } from "@/server/dal";
import { requireClinic } from "@/server/tenant";

/**
 * Guards the entire /coach subtree. Every page under it — now and in the
 * future — is coach-only; alunos and admins are redirected to their own area.
 *
 * Also reads whether this clinic's starter templates have been seeded yet and
 * hands the flag to a client island: on the coach's first sign-in it fires the
 * one-shot background seed; once seeded, the island renders nothing and makes no
 * call.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["coach"]);
  const ctx = await requireClinic();
  const [clinic, calendar, whatsapp] = await Promise.all([
    clinics.getClinic(ctx),
    plans.canUseCalendar(ctx),
    plans.canUseWhatsapp(ctx),
  ]);
  const startersSeeded = Boolean(clinic?.startersSeededAt);

  return (
    <DashboardShell user={session.user} capabilities={{ calendar, whatsapp }}>
      <StartersEnsure seeded={startersSeeded} />
      {children}
    </DashboardShell>
  );
}
