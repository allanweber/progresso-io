import { NextResponse } from "next/server";

import {
  canUseBrandedPortal,
  type ClinicSettingsDto,
  clinicSettingsSchema,
} from "@/lib/clinic-settings";
import type { Clinic } from "@/db/schema";
import { clinics } from "@/server/dal";
import {
  apiError,
  fieldConflict,
  forbidden,
  notFound,
  readJson,
  unauthorized,
  validationError,
} from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

/**
 * Clinic settings, read + written by the /coach/settings page via TanStack
 * Query. Coach-only; the tenant (and thus which clinic is touched) comes from
 * the session via getTenantContext — never from the request. Every write is
 * validated with zod and goes through the DAL, scoped to this clinic.
 */

export const GET = withRoute("coach.settings.read", async () => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const settings = await clinics.getClinicSettings(ctx);
  if (!settings) return notFound("Clínica não encontrada.");
  return NextResponse.json(settings satisfies ClinicSettingsDto);
});

export const PUT = withRoute("coach.settings.update", async (request) => {
  const ctx = await getTenantContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "coach") return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = clinicSettingsSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const clinic = await clinics.getClinic(ctx);
  if (!clinic) return notFound("Clínica não encontrada.");

  // The branded portal (custom slug + branding) is a paid-plan feature. Free
  // clinics can still save name + feedback prefs, but not any branding value.
  if (!canUseBrandedPortal(clinic.plan)) {
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
  };
}
