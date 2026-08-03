import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type Session } from "@/lib/auth";
import { homePathForRole, type Role } from "@/lib/roles";

/** Returns the current session, or null when not signed in. */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** Returns the session, redirecting to /login when there is none. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Returns the session, redirecting to /login when unauthenticated and to the
 * user's own home when their role isn't allowed here.
 */
export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  const role = session.user.role as Role | undefined;
  if (!role || !allowed.includes(role)) {
    redirect(homePathForRole(role));
  }
  return session;
}
