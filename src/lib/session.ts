import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type Session } from "@/lib/auth";
import { homePathForRole, isRole, type Role } from "@/lib/roles";

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
 * Enforces strict, single-role access. Each area is exclusive to one role:
 * a user whose role isn't in `allowed` is bounced to their own home and never
 * sees the page. Roles are fully siloed — there is no cross-role or super-admin
 * override.
 *
 * Redirects to /login when unauthenticated or when the role is unknown (a
 * corrupt/legacy value that maps to no area), which also prevents redirect
 * loops.
 */
export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  const role = session.user.role;

  if (!isRole(role)) {
    redirect("/login");
  }
  if (!allowed.includes(role)) {
    redirect(homePathForRole(role));
  }
  return session;
}
