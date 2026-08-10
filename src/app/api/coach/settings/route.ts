import { NextResponse } from "next/server";

import {
  type ClinicSettingsDto,
  clinicSettingsSchema,
} from "@/lib/clinic-settings";
import { clinics } from "@/server/dal";
import {
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

  // Subdomain is unique across the platform; surface a duplicate under its field.
  if (
    data.portalSubdomain &&
    (await clinics.isSubdomainTaken(ctx, data.portalSubdomain))
  ) {
    const m = "Este subdomínio já está em uso.";
    return fieldConflict(m, { portalSubdomain: m });
  }

  const updated = await clinics.updateClinicSettings(ctx, data);
  const settings: ClinicSettingsDto = {
    name: updated.name,
    portalSubdomain: updated.portalSubdomain,
    feedbackFrequency: updated.feedbackFrequency,
    feedbackPreferredDay: updated.feedbackPreferredDay,
    feedbackWhatsappReminder: updated.feedbackWhatsappReminder,
    plan: updated.plan,
  };
  return NextResponse.json(settings);
});
