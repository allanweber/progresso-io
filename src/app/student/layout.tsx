import type { Metadata } from "next";

import { accentThemeVars, canUseBrandedPortal } from "@/lib/clinic-settings";
import { effectivePlanOf } from "@/lib/plans";
import { requireRole } from "@/lib/session";
import { clinics } from "@/server/dal";
import { requireClinic } from "@/server/tenant";

export const metadata: Metadata = {
  title: "Portal do aluno — Progresso IO",
};

/**
 * Guards the entire /student subtree — the aluno's portal. Coaches and admins
 * are redirected to their own area. Route protection lives here in the server
 * layout (defense in depth); the portal chrome (sidebar / header / bottom bar)
 * and sign-out live in the page, which is a client component reading the
 * aluno's data through the API + TanStack Query.
 *
 * It also paints the portal in the clinic's accent, by redefining the primary
 * token for this subtree. The portal is built out of `bg-primary`,
 * `text-primary` and `bg-primary-light` throughout — the mobile header, the nav's
 * active row, the progress bars, every chip — so one override at the root brands
 * all of it, and nothing downstream needs to know about accents.
 *
 * Deliberately resolved on the SERVER, not from the profile query the page runs:
 * the aluno's own portal must not open Progresso-green and repaint itself once a
 * fetch lands. Plan-gated like every other branded surface, so a free clinic's
 * portal keeps the default palette.
 */
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["aluno"]);
  const ctx = await requireClinic();
  const clinic = await clinics.getClinic(ctx);

  const accent =
    clinic && canUseBrandedPortal(effectivePlanOf(clinic, new Date()))
      ? clinic.accentColor
      : null;
  const vars = accentThemeVars(accent);

  // No accent (or no entitlement) → no wrapper at all, so the portal renders
  // exactly as it did before rather than inside a pointless div.
  if (!vars) return children;

  return (
    <div style={vars as React.CSSProperties} className="contents">
      {children}
    </div>
  );
}
