import { and, eq, ne } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Clinic, Plan } from "@/db/schema";
import type { ClinicSettingsDto, ClinicSettingsValues } from "@/lib/clinic-settings";
import type { TenantContext } from "@/server/tenant";

/* -------------------------------------------------------------------------- */
/*  Bootstrap (no tenant yet — used to create the tenant itself)              */
/* -------------------------------------------------------------------------- */

/**
 * Creates a clinic owned by a user. This is a bootstrap operation (there is no
 * tenant context yet), so it takes a raw DB handle rather than a
 * {@link TenantContext}. Called from the sign-up hook in lib/auth.
 */
export async function createClinicForOwner(
  db: DB,
  input: { ownerUserId: string; name: string; plan?: Plan },
): Promise<Clinic> {
  const [clinic] = await db
    .insert(schema.clinic)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name,
      plan: input.plan ?? "free",
    })
    .returning();
  return clinic;
}

/** Attaches a user to a clinic (bootstrap). */
export async function attachUserToClinic(
  db: DB,
  userId: string,
  clinicId: string,
): Promise<void> {
  await db
    .update(schema.user)
    .set({ clinicId })
    .where(eq(schema.user.id, userId));
}

/* -------------------------------------------------------------------------- */
/*  Tenant-scoped                                                             */
/* -------------------------------------------------------------------------- */

/** The current tenant's clinic. */
export async function getClinic(ctx: TenantContext): Promise<Clinic | null> {
  const [clinic] = await ctx.db
    .select()
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));
  return clinic ?? null;
}

/**
 * The current tenant's clinic settings as the API's DTO (Clínica + feedback
 * preferences + the read-only plan). Null only if the clinic row is missing.
 */
export async function getClinicSettings(
  ctx: TenantContext,
): Promise<ClinicSettingsDto | null> {
  const clinic = await getClinic(ctx);
  if (!clinic) return null;
  return {
    name: clinic.name,
    portalSubdomain: clinic.portalSubdomain,
    feedbackFrequency: clinic.feedbackFrequency,
    feedbackPreferredDay: clinic.feedbackPreferredDay,
    feedbackWhatsappReminder: clinic.feedbackWhatsappReminder,
    plan: clinic.plan,
  };
}

/**
 * Whether another clinic already claims this portal subdomain. The subdomain is
 * unique across the whole platform (not per-tenant), so this deliberately looks
 * outside `ctx.clinicId` — but only to detect the conflict; it returns nothing
 * else about the other clinic. Excludes the caller's own clinic so re-saving an
 * unchanged subdomain never conflicts with itself.
 */
export async function isSubdomainTaken(
  ctx: TenantContext,
  subdomain: string,
): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: schema.clinic.id })
    .from(schema.clinic)
    .where(
      and(
        eq(schema.clinic.portalSubdomain, subdomain),
        ne(schema.clinic.id, ctx.clinicId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Updates the current tenant's clinic settings (scoped to `ctx.clinicId`, never
 * client input). The plan is intentionally not settable here — it's chosen at
 * sign-up and read-only on the settings screen. Subdomain uniqueness is checked
 * by the route via {@link isSubdomainTaken} before calling this.
 */
export async function updateClinicSettings(
  ctx: TenantContext,
  values: ClinicSettingsValues,
): Promise<Clinic> {
  const [updated] = await ctx.db
    .update(schema.clinic)
    .set({
      name: values.name,
      portalSubdomain: values.portalSubdomain,
      feedbackFrequency: values.feedbackFrequency,
      feedbackPreferredDay: values.feedbackPreferredDay,
      feedbackWhatsappReminder: values.feedbackWhatsappReminder,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinic.id, ctx.clinicId))
    .returning();
  return updated;
}
