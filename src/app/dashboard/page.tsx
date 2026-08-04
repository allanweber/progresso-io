import { redirect } from "next/navigation";

import { homePathForRole, isRole } from "@/lib/roles";
import { requireSession } from "@/lib/session";

/**
 * Neutral post-login dispatcher. Holds no UI and belongs to no role — it just
 * forwards each user to their own siloed area. Used as the OAuth callback and
 * as a generic "go to my dashboard" link.
 */
export default async function DashboardDispatcher() {
  const session = await requireSession();
  const role = session.user.role;
  redirect(isRole(role) ? homePathForRole(role) : "/login");
}
