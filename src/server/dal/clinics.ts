import { and, eq, isNull, ne } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Clinic, Plan } from "@/db/schema";
import {
  canUseBrandedPortal,
  type ClinicPublicBrandingDto,
  type ClinicSettingsDto,
  type ClinicSettingsValues,
} from "@/lib/clinic-settings";
import { effectivePlanOf, trialEndsAtFrom } from "@/lib/plans";
import type { TenantContext } from "@/server/tenant";

/* -------------------------------------------------------------------------- */
/*  Bootstrap (no tenant yet — used to create the tenant itself)              */
/* -------------------------------------------------------------------------- */

/**
 * Creates a clinic owned by a user. This is a bootstrap operation (there is no
 * tenant context yet), so it takes a raw DB handle rather than a
 * {@link TenantContext}. Called from the sign-up hook in lib/auth.
 *
 * **A clinic is never created on a paid plan from sign-up.** The plan a coach
 * picks in the wizard is stored as `intendedPlan` — intent for the manual
 * fatura — and the clinic starts on `free` with a {@link TRIAL_DAYS}-day trial,
 * which resolves to Solo limits while it runs (see `getPlanLimits`). Granting
 * the picked plan outright is what handed out paid plans for free.
 *
 * `plan` stays available for the callers that legitimately set one directly —
 * the seed and admin-created clinics — and skips the trial when passed.
 */
export async function createClinicForOwner(
  db: DB,
  input: {
    ownerUserId: string;
    name: string;
    plan?: Plan;
    /** The wizard pick. Recorded, never granted. */
    intendedPlan?: Plan;
    /** Start a trial from this instant. Omit for no trial. */
    trialFrom?: Date;
  },
): Promise<Clinic> {
  const [clinic] = await db
    .insert(schema.clinic)
    .values({
      ownerUserId: input.ownerUserId,
      name: input.name,
      plan: input.plan ?? "free",
      intendedPlan: input.intendedPlan ?? null,
      trialEndsAt: input.trialFrom ? trialEndsAtFrom(input.trialFrom) : null,
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

/**
 * The owner of a clinic, by clinic id and a raw DB handle.
 *
 * For the paths that must act inside a tenant without a session to derive one
 * from — the public anamnese-fill route handing a student their portal access,
 * the reminder cron — the clinic owner is who the resulting messages are
 * attributed to. There is no chicken-and-egg here: the clinic id comes from a
 * row the caller already authenticated by token, never from client input.
 */
export async function getClinicOwner(
  db: DB,
  clinicId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ownerUserId: schema.clinic.ownerUserId })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  return row?.ownerUserId ?? null;
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
    headline: clinic.headline,
    description: clinic.description,
    whatsapp: clinic.whatsapp,
    instagram: clinic.instagram,
    siteUrl: clinic.siteUrl,
    accentColor: clinic.accentColor,
    hasLogo: clinic.logoKey !== null,
    feedbackFrequency: clinic.feedbackFrequency,
    feedbackPreferredDay: clinic.feedbackPreferredDay,
    feedbackWhatsappReminder: clinic.feedbackWhatsappReminder,
    plan: clinic.plan,
    brandedPortal: canUseBrandedPortal(effectivePlanOf(clinic, new Date())),
    onboardingCompletedAt: clinic.onboardingCompletedAt?.toISOString() ?? null,
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
      headline: values.headline,
      description: values.description,
      whatsapp: values.whatsapp,
      instagram: values.instagram,
      siteUrl: values.siteUrl,
      accentColor: values.accentColor,
      feedbackFrequency: values.feedbackFrequency,
      feedbackPreferredDay: values.feedbackPreferredDay,
      feedbackWhatsappReminder: values.feedbackWhatsappReminder,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinic.id, ctx.clinicId))
    .returning();
  return updated;
}

/**
 * Marks the setup guide as done for this clinic — on finish and on skip alike.
 *
 * Stamps only the first time: the column records when the clinic first got
 * through the guide, and a re-run months later must not rewrite that. Returns
 * the effective timestamp either way, so the caller never has to re-read.
 */
export async function completeOnboarding(ctx: TenantContext): Promise<Date> {
  const now = new Date();
  const [updated] = await ctx.db
    .update(schema.clinic)
    .set({ onboardingCompletedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.clinic.id, ctx.clinicId),
        isNull(schema.clinic.onboardingCompletedAt),
      ),
    )
    .returning({ at: schema.clinic.onboardingCompletedAt });
  if (updated?.at) return updated.at;

  // Already stamped (a re-run, or a double-submit) — report the original.
  const [row] = await ctx.db
    .select({ at: schema.clinic.onboardingCompletedAt })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, ctx.clinicId));
  return row?.at ?? now;
}

/**
 * Persists the clinic's logo storage key (tenant-scoped). Called by the logo
 * upload route after the file is stored; the raw key never leaves the server.
 */
export async function setClinicLogoKey(
  ctx: TenantContext,
  logoKey: string,
): Promise<void> {
  await ctx.db
    .update(schema.clinic)
    .set({ logoKey, updatedAt: new Date() })
    .where(eq(schema.clinic.id, ctx.clinicId));
}

/* -------------------------------------------------------------------------- */
/*  Public branded portal (pre-auth, by slug — deliberately NOT tenant-scoped) */
/*                                                                            */
/*  The clinic microsite + branded login are public and resolved by slug        */
/*  before any session exists, so these take a raw DB handle. They expose ONLY   */
/*  the clinic's own public branding (no students, no PII) and only for a clinic */
/*  on a paid plan with the slug set — an unknown/reserved/free/downgraded slug   */
/*  resolves to null (a 404).                                                    */
/* -------------------------------------------------------------------------- */

/** The public branding for a slug, or null when it shouldn't resolve. */
export async function getPublicClinicBySlug(
  db: DB,
  slug: string,
): Promise<ClinicPublicBrandingDto | null> {
  const [c] = await db
    .select({
      name: schema.clinic.name,
      slug: schema.clinic.portalSubdomain,
      plan: schema.clinic.plan,
      intendedPlan: schema.clinic.intendedPlan,
      trialEndsAt: schema.clinic.trialEndsAt,
      logoKey: schema.clinic.logoKey,
      headline: schema.clinic.headline,
      description: schema.clinic.description,
      whatsapp: schema.clinic.whatsapp,
      instagram: schema.clinic.instagram,
      siteUrl: schema.clinic.siteUrl,
      accentColor: schema.clinic.accentColor,
    })
    .from(schema.clinic)
    .where(eq(schema.clinic.portalSubdomain, slug))
    .limit(1);
  // No row, or the clinic downgraded off a paid plan (a running trial counts as
  // paid) → the portal is unpublished.
  if (!c || !c.slug || !canUseBrandedPortal(effectivePlanOf(c, new Date())))
    return null;
  return {
    slug: c.slug,
    name: c.name,
    headline: c.headline,
    description: c.description,
    whatsapp: c.whatsapp,
    instagram: c.instagram,
    siteUrl: c.siteUrl,
    accentColor: c.accentColor,
    hasLogo: c.logoKey !== null,
  };
}

/**
 * The logo storage key for a public slug, or null when the portal isn't
 * published (unknown/free/downgraded) or has no logo. Used by the public logo
 * route; paid-gated so a free clinic's key is never served.
 */
export async function getPublicLogoKeyBySlug(
  db: DB,
  slug: string,
): Promise<string | null> {
  const [c] = await db
    .select({
      logoKey: schema.clinic.logoKey,
      plan: schema.clinic.plan,
      intendedPlan: schema.clinic.intendedPlan,
      trialEndsAt: schema.clinic.trialEndsAt,
    })
    .from(schema.clinic)
    .where(eq(schema.clinic.portalSubdomain, slug))
    .limit(1);
  if (!c || !canUseBrandedPortal(effectivePlanOf(c, new Date()))) return null;
  return c.logoKey;
}
