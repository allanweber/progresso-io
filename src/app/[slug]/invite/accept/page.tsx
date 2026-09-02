import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { PortalHeader, loadPortalBranding } from "@/components/portal/header";
import { accentThemeVars } from "@/lib/clinic-settings";

type Params = { params: Promise<{ slug: string }> };
type Search = { searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const branding = await loadPortalBranding(slug);
  return {
    title: branding ? `Ativar acesso — ${branding.name}` : "Ativar acesso",
  };
}

/**
 * Branded invite-accept (`/<slug>/invite/accept`). Identical to the canonical
 * `/invite/accept` — same island, same token, same endpoint — wearing the
 * clinic's logo, name and accent, because this is the first page a new aluno
 * ever opens and it should look like their coach's, not ours.
 *
 * On success the island sends them to the clinic's own sign-in rather than the
 * generic one, so the whole activation stays inside the portal.
 *
 * A slug that no longer resolves (the portal went dark, or was never published)
 * **redirects to the canonical route with the token intact** instead of 404ing:
 * an invite already sitting in a student's inbox must keep working after their
 * coach's trial ends. Branding is the part that expires, not the invitation.
 */
export default async function BrandedInviteAcceptPage({
  params,
  searchParams,
}: Params & Search) {
  const { slug } = await params;
  const { token } = await searchParams;
  const branding = await loadPortalBranding(slug);

  if (!branding) {
    redirect(`/invite/accept?token=${encodeURIComponent(token ?? "")}`);
  }

  return (
    // The clinic's accent becomes this subtree's primary token, so the
    // set-password CTA and focus ring wear it too, not just the mark on top.
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-surface-light px-4 py-12"
      style={accentThemeVars(branding.accentColor) as React.CSSProperties | undefined}
    >
      <PortalHeader branding={branding} className="mb-8" />
      <InviteAcceptForm
        token={token ?? ""}
        loginPath={`/${branding.slug}/entrar`}
      />
    </main>
  );
}
