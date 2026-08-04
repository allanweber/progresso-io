import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/session";

/**
 * Guards the entire /student subtree. Every page under it — now and in the
 * future — is aluno-only; coaches and admins are redirected to their own area.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["aluno"]);
  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}
