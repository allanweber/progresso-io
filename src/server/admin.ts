import type { Session } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { getSession } from "@/lib/session";

/**
 * Returns the current session only when it belongs to a platform admin
 * (`role = "admin"`), otherwise null — the API-route counterpart to the
 * `requireRole(["admin"])` used by the /admin page tree. Admin API handlers
 * gate on this before touching the cross-tenant {@link import("@/server/dal").admin}
 * DAL, so no coach or aluno can reach platform-wide operations.
 */
export async function getAdminSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session || !isAdmin(session.user.role)) return null;
  return session;
}
