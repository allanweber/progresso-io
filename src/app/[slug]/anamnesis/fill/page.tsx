import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AnamnesisFillIsland } from "@/components/anamneses/anamnesis-fill-island";
import { PortalHeader, loadPortalBranding } from "@/components/portal/header";
import { accentThemeVars } from "@/lib/clinic-settings";

type Params = { params: Promise<{ slug: string }> };
type Search = { searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const branding = await loadPortalBranding(slug);
  return { title: branding ? `Anamnese — ${branding.name}` : "Anamnese" };
}

/**
 * Branded anamnese fill (`/<slug>/anamnesis/fill`). The same public island as
 * the canonical route — token + WhatsApp number are still the only credential —
 * under the clinic's mark, because this questionnaire is usually the very first
 * thing a new student receives from their coach.
 *
 * Keeps the aluno posture of the canonical page (the Aluno Ground and
 * `.posture-reading`, sized for a phone at arm's length) rather than the coach's
 * desk density.
 *
 * A slug that no longer resolves redirects to the canonical route with the token
 * intact — a questionnaire already sent must not stop working because the
 * clinic's portal went dark.
 */
export default async function BrandedAnamnesisFillPage({
  params,
  searchParams,
}: Params & Search) {
  const { slug } = await params;
  const { token } = await searchParams;
  const branding = await loadPortalBranding(slug);

  if (!branding) {
    redirect(`/anamnesis/fill?token=${encodeURIComponent(token ?? "")}`);
  }

  return (
    <main
      className="posture-reading min-h-screen bg-ground-aluno"
      style={accentThemeVars(branding.accentColor) as React.CSSProperties | undefined}
    >
      <PortalHeader branding={branding} className="px-4 pt-10" />
      <AnamnesisFillIsland token={token ?? ""} />
    </main>
  );
}
