import type { FeedbackFrequency, Plan, Weekday } from "@/db/schema";
import { z } from "@/lib/validation";

/**
 * Client-safe clinic-settings domain: enum values, PT-BR labels, and the zod
 * schema shared by the settings API route and the TanStack Form on the client.
 * Only erased `import type`s from the schema, so it bundles into client code
 * (same shape as lib/students). The literal arrays are checked against the
 * schema's types via `satisfies`, keeping them in sync.
 */

export const FEEDBACK_FREQUENCY_VALUES = [
  "semanal",
  "quinzenal",
  "mensal",
] as const satisfies readonly FeedbackFrequency[];

export const WEEKDAY_VALUES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const satisfies readonly Weekday[];

/** Frequency options as rendered in the mockup: a title + a supporting line. */
export const FEEDBACK_FREQUENCY_LABELS: Record<
  FeedbackFrequency,
  { label: string; desc: string }
> = {
  semanal: {
    label: "Semanal",
    desc: "Check-in toda semana · alto acompanhamento",
  },
  quinzenal: {
    label: "Quinzenal",
    desc: "A cada 2 semanas · equilíbrio entre atenção e autonomia",
  },
  mensal: { label: "Mensal", desc: "Uma vez por mês · alunos mais avançados" },
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Segunda-feira",
  tuesday: "Terça-feira",
  wednesday: "Quarta-feira",
  thursday: "Quinta-feira",
  friday: "Sexta-feira",
  saturday: "Sábado",
  sunday: "Domingo",
};

/**
 * Slugs a clinic may NOT claim — every top-level route segment (so a slug can't
 * shadow a real page) plus platform/internal names and common vanity words. The
 * bare `/<slug>` microsite is a root catch-all, so a claimed slug that collides
 * with a route would be unreachable (static routes win) — this keeps the two
 * namespaces disjoint. Adding a new top-level route means adding it here.
 */
export const RESERVED_SLUGS = new Set<string>([
  // Top-level route segments (src/app/*)
  "admin", "admin-invite", "anamnesis", "api", "actions", "coach", "student",
  "dashboard", "login", "register", "forgot-password", "reset-password",
  "verify-account", "invite", "contact", "privacy", "terms",
  // Platform / internals / common vanity
  "app", "www", "mail", "email", "static", "assets", "cdn", "media", "files",
  "uploads", "public", "settings", "account", "profile", "billing", "checkout",
  "docs", "blog", "help", "support", "status", "about", "pricing", "signin",
  "signup", "signout", "logout", "favicon", "robots", "sitemap", "_next", "next",
  "progresso", "progressoio", "null", "undefined",
]);

/**
 * Portal slug: lowercase letters/digits in hyphen-separated groups (no
 * leading/trailing/double hyphen), 3–30 chars, and not a reserved word.
 * Validated only when set — see {@link clinicSettingsSchema}. Also guards the
 * public portal-logo route param — a slug this rejects can never belong to a
 * clinic.
 */
const SUBDOMAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const subdomainSlug = z
  .string()
  .min(3, "O endereço deve ter ao menos 3 caracteres.")
  .max(30, "O endereço deve ter no máximo 30 caracteres.")
  .regex(SUBDOMAIN_SLUG, "Use apenas letras minúsculas, números e hífens.")
  .refine((s) => !RESERVED_SLUGS.has(s), "Este endereço é reservado.");

/**
 * Slug is optional: the form always sends a string (possibly empty), which
 * becomes null; a non-empty value must be a valid slug. Mirrors the optional-
 * field pattern in lib/students. Global uniqueness is enforced in the DAL.
 */
const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), subdomainSlug]));

/** An optional free-text branding field: empty string → null, else capped. */
function optionalText(max: number, message = "Texto muito longo.") {
  return z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.union([z.null(), z.string().max(max, message)]));
}

/** Brand accent color as a #rrggbb hex (empty → null). */
const accentColorSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z.union([
      z.null(),
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB."),
    ]),
  );

/** Optional site URL (must include http/https when set; empty → null). */
const siteUrlSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z.union([
      z.null(),
      z.string().max(200).url("Informe uma URL válida (com https://)."),
    ]),
  );

/** The editable clinic settings (Clínica + branding + Preferências de feedback). */
export const clinicSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da clínica.")
    .max(80, "Nome muito longo."),
  portalSubdomain: subdomainSchema,
  // Branded-portal fields (all optional).
  headline: optionalText(120),
  description: optionalText(600),
  whatsapp: optionalText(20),
  instagram: optionalText(60),
  siteUrl: siteUrlSchema,
  accentColor: accentColorSchema,
  feedbackFrequency: z.enum(FEEDBACK_FREQUENCY_VALUES),
  feedbackPreferredDay: z.enum(WEEKDAY_VALUES),
  feedbackWhatsappReminder: z.boolean(),
});

export type ClinicSettingsInput = z.input<typeof clinicSettingsSchema>;
export type ClinicSettingsValues = z.output<typeof clinicSettingsSchema>;

/**
 * The settings as serialized by the API. Adds the read-only `plan` (chosen at
 * sign-up) that the "Plano atual" card displays; the PUT never changes it.
 * `hasLogo` tells the client whether to show the current logo (served by the
 * public logo route) — the raw storage key is never exposed.
 */
export type ClinicSettingsDto = {
  name: string;
  portalSubdomain: string | null;
  headline: string | null;
  description: string | null;
  whatsapp: string | null;
  instagram: string | null;
  siteUrl: string | null;
  accentColor: string | null;
  hasLogo: boolean;
  feedbackFrequency: FeedbackFrequency;
  feedbackPreferredDay: Weekday;
  feedbackWhatsappReminder: boolean;
  plan: Plan;
};

/** Plans allowed to publish a branded portal (a custom slug + branding). */
export const BRANDED_PORTAL_PLANS: readonly Plan[] = [
  "solo",
  "clinica",
  "enterprise",
];

/** Whether a plan may publish a branded portal (free is excluded). */
export function canUseBrandedPortal(plan: Plan): boolean {
  return BRANDED_PORTAL_PLANS.includes(plan);
}

/**
 * The public branding a clinic microsite + branded login render. No PII — only
 * the clinic's own public-facing profile. Served for a slug that belongs to a
 * paid clinic; unknown/reserved/free slugs resolve to null (a 404).
 */
export type ClinicPublicBrandingDto = {
  slug: string;
  name: string;
  headline: string | null;
  description: string | null;
  whatsapp: string | null;
  instagram: string | null;
  siteUrl: string | null;
  accentColor: string | null;
  hasLogo: boolean;
};

/** Public route that streams a clinic's logo (or a placeholder) by slug. */
export function clinicLogoUrl(slug: string): string {
  return `/api/public/clinic/${encodeURIComponent(slug)}/logo`;
}

/** Normalizes an Instagram handle/URL to a profile URL, or null. */
export function instagramUrl(handle: string | null): string | null {
  if (!handle) return null;
  const h = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  const clean = h.replace(/\/+$/, "");
  return clean ? `https://instagram.com/${clean}` : null;
}

/** Normalizes a WhatsApp number to a wa.me link (digits only), or null. */
export function whatsappUrl(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
