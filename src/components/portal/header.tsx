import { db } from "@/db";
import {
  clinicLogoUrl,
  type ClinicPublicBrandingDto,
} from "@/lib/clinic-settings";
import { cn } from "@/lib/utils";
import { clinics } from "@/server/dal";

/**
 * The clinic's mark above a student-facing portal page.
 *
 * Shared by every page a coach's link can land on — branded invite-accept and
 * branded anamnese fill — which is why it is a component rather than markup
 * repeated in each. The branded sign-in keeps its own full-height panel: it is a
 * two-column layout, not a header.
 */
export function PortalHeader({
  branding,
  className,
}: {
  branding: ClinicPublicBrandingDto;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col items-center gap-3", className)}>
      {branding.hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clinicLogoUrl(branding.slug)}
          alt={branding.name}
          className="size-16 rounded-2xl object-cover ring-1 ring-black/5"
        />
      ) : (
        // No inline accent: the page root sets the clinic's colour as this
        // subtree's primary token, so `bg-primary` already IS the accent.
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white">
          {branding.name.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <div className="text-center">
        <h1 className="font-heading text-title font-bold text-foreground">
          {branding.name}
        </h1>
        {branding.headline ? (
          <p className="mt-0.5 text-body-dense text-muted-foreground">
            {branding.headline}
          </p>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The public branding for a portal slug, or null when it should not resolve
 * (unknown slug, no slug set, or a clinic whose branded portal is not permitted).
 * The single loader every branded page uses, so they all agree on when a portal
 * is live — the same answer the microsite and the branded login give.
 */
export async function loadPortalBranding(
  slug: string,
): Promise<ClinicPublicBrandingDto | null> {
  return clinics.getPublicClinicBySlug(db, slug);
}
