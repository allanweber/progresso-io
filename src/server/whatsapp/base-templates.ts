import baseTemplates from "../../../drizzle/data/whatsapp-templates.json";

/**
 * The app-wide **base** WhatsApp template catalog, loaded from
 * `drizzle/data/whatsapp-templates.json` (the single source of truth, edited as
 * data like every other seed file). Seeded once globally with `clinicId = null`
 * (see `src/db/seed.ts`); a clinic may later add its own row with the same `key`
 * to override. Each `body` may reference `{nome}` (all), `{periodo}`
 * (`checkin_reminder`), and `{link}` (`checkin_feedback`, `welcome_access`,
 * `anamnesis_reminder`), filled by `renderTemplate` at send time.
 */
export type BaseWhatsAppTemplate = { key: string; title: string; body: string };

export const BASE_WHATSAPP_TEMPLATES: BaseWhatsAppTemplate[] =
  baseTemplates as BaseWhatsAppTemplate[];
