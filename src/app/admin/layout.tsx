import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/session";

/**
 * Guards the entire /admin subtree. Every page under it — now and in the
 * future — is admin-only; coaches and alunos are redirected to their own area.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["admin"]);
  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}
