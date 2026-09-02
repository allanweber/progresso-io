import { NextResponse } from "next/server";

import {
  canUseBrandedPortal,
  type ClinicSettingsDto,
  clinicSettingsSchema,
} from "@/lib/clinic-settings";
import type { Clinic } from "@/db/schema";
import { effectivePlanOf } from "@/lib/plans";
import { clinics } from "@/server/dal";
import { withCoach } from "@/server/guard";
import {
  apiError,
  fieldConflict,
  notFound,
  readJson,
  validationError,
} from "@/server/api";

/**
 * Clinic settings, read + written by the /coach/settings page via TanStack
 * Query. Coach-only; the tenant (and thus which clinic is touched) comes from
 * the session via getTenantContext — never from the request. Every write is
 * validated with zod and goes through the DAL, scoped to this clinic.
 */

export const GET = withCoach("coach.settings.read", async (_request, ctx) => {
  const settings = await clinics.getClinicSettings(ctx);
  if (!settings) return notFound("Clínica não encontrada.");
  return NextResponse.json(settings satisfies ClinicSettingsDto);
});

export const PUT = withCoach("coach.settings.update", async (request, ctx) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = clinicSettingsSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return notFound("Clínica não encontrada.");

  // The branded portal (custom slug + branding) is a paid-plan feature; a running
  // trial counts as paid, so the setup guide's Portal step can actually save.
  // Free clinics can still save name + feedback prefs, but not any branding value.
  if (!canUseBrandedPortal(effectivePlanOf(clinic, new Date()))) {
    const wantsBranding = Boolean(
      data.portalSubdomain ||
        data.headline ||
        data.description ||
        data.whatsapp ||
        data.instagram ||
        data.siteUrl ||
        data.accentColor,
    );
    if (wantsBranding) {
      return apiError(
        "O portal personalizado está disponível apenas nos planos pagos.",
        403,
      );
    }
  }

  // Slug is unique across the platform; surface a duplicate under its field.
  if (
    data.portalSubdomain &&
    (await clinics.isSubdomainTaken(ctx, data.portalSubdomain))
  ) {
    const m = "Este endereço já está em uso.";
    return fieldConflict(m, { portalSubdomain: m });
  }

  const updated = await clinics.updateClinicSettings(ctx, data);
  return NextResponse.json(toDto(updated));
});

/** Serializes a clinic row into the settings DTO (never exposes the logo key). */
function toDto(c: Clinic): ClinicSettingsDto {
  return {
    name: c.name,
    portalSubdomain: c.portalSubdomain,
    headline: c.headline,
    description: c.description,
    whatsapp: c.whatsapp,
    instagram: c.instagram,
    siteUrl: c.siteUrl,
    accentColor: c.accentColor,
    hasLogo: c.logoKey !== null,
    feedbackFrequency: c.feedbackFrequency,
    feedbackPreferredDay: c.feedbackPreferredDay,
    feedbackWhatsappReminder: c.feedbackWhatsappReminder,
    plan: c.plan,
    brandedPortal: canUseBrandedPortal(effectivePlanOf(c, new Date())),
    onboardingCompletedAt: c.onboardingCompletedAt?.toISOString() ?? null,
  };
}
