import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/session";

/**
 * Guards the entire /coach subtree. Every page under it — now and in the
 * future — is coach-only; alunos and admins are redirected to their own area.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["coach"]);
  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}
