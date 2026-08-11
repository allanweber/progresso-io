import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic auth guard for every authenticated area. It only checks for the
 * presence of the session cookie (fast, no DB round-trip) to keep signed-out
 * users out; the authoritative session AND role checks happen in each area's
 * layout via `requireRole`, which is what actually enforces role isolation.
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Bounce to /login. No `?redirect=` is attached: nothing consumes it, and a
    // dangling, attacker-controllable return path is an open-redirect waiting to
    // happen if it were ever wired into a post-login `router.push`.
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/coach",
    "/coach/:path*",
    "/student",
    "/student/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
