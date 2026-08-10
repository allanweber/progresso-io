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
 * Portal subdomain slug: lowercase letters/digits in hyphen-separated groups
 * (no leading/trailing/double hyphen), 3–30 chars. Validated only when set —
 * see {@link clinicSettingsSchema}.
 */
const SUBDOMAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const subdomainSlug = z
  .string()
  .min(3, "O subdomínio deve ter ao menos 3 caracteres.")
  .max(30, "O subdomínio deve ter no máximo 30 caracteres.")
  .regex(SUBDOMAIN_SLUG, "Use apenas letras minúsculas, números e hífens.");

/**
 * Subdomain is optional: the form always sends a string (possibly empty), which
 * becomes null; a non-empty value must be a valid slug. Mirrors the optional-
 * field pattern in lib/students. Global uniqueness is enforced in the DAL.
 */
const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), subdomainSlug]));

/** The editable clinic settings (Clínica + Preferências de feedback sections). */
export const clinicSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da clínica.")
    .max(80, "Nome muito longo."),
  portalSubdomain: subdomainSchema,
  feedbackFrequency: z.enum(FEEDBACK_FREQUENCY_VALUES),
  feedbackPreferredDay: z.enum(WEEKDAY_VALUES),
  feedbackWhatsappReminder: z.boolean(),
});

export type ClinicSettingsInput = z.input<typeof clinicSettingsSchema>;
export type ClinicSettingsValues = z.output<typeof clinicSettingsSchema>;

/**
 * The settings as serialized by the API. Adds the read-only `plan` (chosen at
 * sign-up) that the "Plano atual" card displays; the PUT never changes it.
 */
export type ClinicSettingsDto = {
  name: string;
  portalSubdomain: string | null;
  feedbackFrequency: FeedbackFrequency;
  feedbackPreferredDay: Weekday;
  feedbackWhatsappReminder: boolean;
  plan: Plan;
};
