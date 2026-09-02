import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { db } from "@/db";
import {
  accentThemeVars,
  clinicLogoUrl,
  type ClinicPublicBrandingDto,
} from "@/lib/clinic-settings";
import { clinics } from "@/server/dal";

/**
 * Branded sign-in for a clinic portal (`/<slug>/entrar`). Renders the clinic's
 * logo/name/accent alongside the standard {@link LoginForm}. The slug is purely
 * branding: sign-in is unchanged, and on success the normal role-routing sends
 * the user to their own home (aluno → /student, coach → /coach). Public, resolves
 * only for a paid clinic with the slug set (else 404).
 */

type Params = { params: Promise<{ slug: string }> };
type Search = { searchParams: Promise<{ reset?: string; error?: string; verified?: string; activated?: string }> };

async function loadBranding(slug: string): Promise<ClinicPublicBrandingDto | null> {
  return clinics.getPublicClinicBySlug(db, slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const b = await loadBranding(slug);
  return { title: b ? `Entrar — ${b.name}` : "Portal não encontrado" };
}

export default async function ClinicLoginPage({
  params,
  searchParams,
}: Params & Search) {
  const { slug } = await params;
  const b = await loadBranding(slug);
  if (!b) notFound();

  const { reset, error, verified, activated } = await searchParams;

  return (
    // The accent is set as the primary token for this subtree, so the sign-in
    // form's own button and focus ring take the clinic's colour too — they used
    // to stay Progresso green beside a fully branded panel.
    <div
      className="flex min-h-screen flex-col md:flex-row"
      style={accentThemeVars(b.accentColor) as React.CSSProperties | undefined}
    >
      {/* Branded panel — the clinic's identity. */}
      <div
        className="flex flex-col items-center justify-center gap-4 bg-primary px-6 py-12 text-center text-white md:w-2/5"
      >
        {b.hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinicLogoUrl(b.slug)}
            alt={b.name}
            className="size-20 rounded-2xl bg-white/10 object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-2xl bg-white/15 text-3xl font-bold">
            {b.name.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <h2 className="font-heading text-2xl font-bold">{b.name}</h2>
        {b.headline && <p className="max-w-xs text-sm text-white/85">{b.headline}</p>}
        <Link href={`/${b.slug}`} className="mt-2 text-xs text-white/70 hover:text-white hover:underline">
          ← Voltar ao portal
        </Link>
      </div>

      {/* Sign-in — standard flow, unchanged. */}
      <div className="flex flex-1 items-center justify-center bg-surface-light px-6 py-10">
        <LoginForm
          justReset={reset === "1"}
          justVerified={verified === "1"}
          justActivated={activated === "1"}
          oauthError={error === "google"}
        />
      </div>
    </div>
  );
}
