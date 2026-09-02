import type { Metadata } from "next";

import { requireRole } from "@/lib/session";
import { requireClinic } from "@/server/tenant";

export const metadata: Metadata = {
  title: "Configuração inicial — Progresso IO",
};

/**
 * Guards the setup guide. Coach-only, like every /coach page — the guide writes
 * clinic-wide settings, so the same role and tenant checks apply.
 *
 * It deliberately lives OUTSIDE /coach: that subtree's layout redirects an
 * un-onboarded clinic here, and a server layout has no pathname to exclude
 * itself with, so a guide nested under /coach would redirect to itself forever.
 * Being outside also gets what the guide wants visually — no sidebar, no
 * billing banner, nothing to click but the flow itself.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["coach"]);
  await requireClinic();

  return <div className="min-h-screen bg-surface-light">{children}</div>;
}
