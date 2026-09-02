import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, Globe, MessageCircle } from "lucide-react";

import { db } from "@/db";
import {
  accentThemeVars,
  clinicLogoUrl,
  instagramUrl,
  whatsappUrl,
  type ClinicPublicBrandingDto,
} from "@/lib/clinic-settings";
import { clinics } from "@/server/dal";

/**
 * Public clinic microsite at `app.progresso.io/<slug>` (path-based, same origin).
 * A branded landing — logo, name, headline, description, contact links — with an
 * "Área do aluno" CTA into the branded login. Server-rendered by slug; resolves
 * only for a clinic on a paid plan with the slug set (else 404). No session, no
 * PII — just the clinic's own public profile.
 */

type Params = { params: Promise<{ slug: string }> };

async function loadBranding(slug: string): Promise<ClinicPublicBrandingDto | null> {
  return clinics.getPublicClinicBySlug(db, slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const b = await loadBranding(slug);
  if (!b) return { title: "Portal não encontrado" };
  return {
    title: `${b.name} — Portal do aluno`,
    description: b.headline ?? `Portal de acompanhamento de ${b.name}.`,
  };
}

export default async function ClinicPortalPage({ params }: Params) {
  const { slug } = await params;
  const b = await loadBranding(slug);
  if (!b) notFound();

  const wa = whatsappUrl(b.whatsapp);
  const ig = instagramUrl(b.instagram);

  return (
    <main
      className="flex min-h-screen flex-col bg-surface-light"
      style={accentThemeVars(b.accentColor) as React.CSSProperties | undefined}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        {b.hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinicLogoUrl(b.slug)}
            alt={b.name}
            className="mb-6 size-24 rounded-2xl object-cover shadow-rest"
          />
        ) : (
          <div
            className="mb-6 flex size-24 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-white shadow-rest"
          >
            {b.name.trim().charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl">
          {b.name}
        </h1>
        {b.headline && (
          <p className="mt-3 text-lg font-medium text-primary">{b.headline}</p>
        )}
        {b.description && (
          <p className="mt-4 max-w-prose whitespace-pre-line text-subtitle leading-relaxed text-muted-foreground">
            {b.description}
          </p>
        )}

        <Link
          href={`/${b.slug}/entrar`}
          className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Área do aluno
        </Link>

        {(wa || ig || b.siteUrl) && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary hover:text-primary"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            {ig && (
              <a
                href={ig}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary hover:text-primary"
              >
                <AtSign className="size-4" /> Instagram
              </a>
            )}
            {b.siteUrl && (
              <a
                href={b.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:border-primary hover:text-primary"
              >
                <Globe className="size-4" /> Site
              </a>
            )}
          </div>
        )}
      </div>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <Link href="/" className="font-medium hover:underline">
          Progresso IO
        </Link>
      </footer>
    </main>
  );
}
