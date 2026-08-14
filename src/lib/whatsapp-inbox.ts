import { z } from "@/lib/validation";

/**
 * WhatsApp inbox — client-safe types, enums, DTOs, the 24h-window math, template
 * rendering, and the zod schemas shared by the API routes and the inbox UI. No
 * server/database import lives here, so both `@/db/schema` (types only) and the
 * `"use client"` inbox page can pull from it.
 *
 * The one WhatsApp rule that shapes everything: a business may send free-text
 * only within a **24h customer-service window** that (re)opens on each inbound
 * message from the person; outside it, only a **pre-approved template** may go
 * out. The window is never stored as a flag — it's derived from the
 * conversation's `lastInboundAt` on every read (`isWindowOpen`).
 */

/* -------------------------------------------------------------------------- */
/*  Enums (const arrays → union types, the codebase idiom)                    */
/* -------------------------------------------------------------------------- */

/** Who sent a message: the person (`inbound`) or the clinic (`outbound`). */
export const WHATSAPP_MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type WhatsAppMessageDirection =
  (typeof WHATSAPP_MESSAGE_DIRECTIONS)[number];

/** Free-text session message vs. a pre-approved template message. */
export const WHATSAPP_MESSAGE_TYPES = ["text", "template"] as const;
export type WhatsAppMessageType = (typeof WHATSAPP_MESSAGE_TYPES)[number];

/**
 * Delivery status of a message. Outbound starts at `sent` (the dev provider
 * can't confirm more); a real provider upgrades to `delivered`/`read`/`failed`
 * via status webhooks. Inbound rows are stored as `delivered` (already received).
 */
export const WHATSAPP_MESSAGE_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];

/** A template's Meta-approval lifecycle. Only `approved` may be sent. */
export const WHATSAPP_TEMPLATE_STATUSES = [
  "approved",
  "pending",
  "rejected",
] as const;
export type WhatsAppTemplateStatus =
  (typeof WHATSAPP_TEMPLATE_STATUSES)[number];

/** A clinic's WhatsApp-number connection state (drives the admin/coach dot). */
export const WHATSAPP_CONNECTION_STATUSES = [
  "connected",
  "pending",
  "disconnected",
] as const;
export type WhatsAppConnectionStatus =
  (typeof WHATSAPP_CONNECTION_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/*  The 24h window                                                            */
/* -------------------------------------------------------------------------- */

export const WHATSAPP_WINDOW_HOURS = 24;
export const WHATSAPP_WINDOW_MS = WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Whether the free-text window is open: true iff the last inbound message landed
 * within the last 24h. No inbound ever (`null`) → closed (template-only), which
 * is also the correct WhatsApp rule for a first contact.
 */
export function isWindowOpen(
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t < WHATSAPP_WINDOW_MS;
}

/**
 * Human label for the window state, PT-BR. Open → "23h 12min restantes";
 * closed → "janela fechada". Used in the conversation list + chat header.
 */
export function windowLabel(
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!isWindowOpen(lastInboundAt, now)) return "janela fechada";
  const remaining = WHATSAPP_WINDOW_MS - (now - new Date(lastInboundAt!).getTime());
  const totalMin = Math.max(0, Math.floor(remaining / 60000));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h > 0) return `${h}h ${min}min restantes`;
  return `${min}min restantes`;
}

/* -------------------------------------------------------------------------- */
/*  PT-BR labels                                                              */
/* -------------------------------------------------------------------------- */

export const WHATSAPP_CONNECTION_LABEL: Record<WhatsAppConnectionStatus, string> =
  {
    connected: "conectado",
    pending: "pendente",
    disconnected: "não conectado",
  };

export const WHATSAPP_TEMPLATE_STATUS_LABEL: Record<
  WhatsAppTemplateStatus,
  string
> = {
  approved: "aprovado",
  pending: "em análise",
  rejected: "rejeitado",
};

/* -------------------------------------------------------------------------- */
/*  Templates                                                                 */
/* -------------------------------------------------------------------------- */

/** Variables a template body can reference; filled at send time. */
export type TemplateVars = { nome?: string; periodo?: string; link?: string };

/**
 * Renders a template body, substituting `{nome}` / `{periodo}` / `{link}` with
 * the provided values. Missing `nome` falls back to a neutral "aluno(a)"; a
 * placeholder with no value provided is left untouched (never broken output).
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key === "nome") return vars.nome?.trim() || "aluno(a)";
    if (key === "periodo") return vars.periodo?.trim() || match;
    if (key === "link") return vars.link?.trim() || match;
    return match;
  });
}

/**
 * The `{periodo}` fragment for the check-in reminder, from the clinic's cadence
 * (`clinic.feedbackFrequency`) — carries the article so the grammar stays clean
 * ("check-in da semana / da quinzena / do mês").
 */
export const CHECKIN_PERIODO: Record<
  "semanal" | "quinzenal" | "mensal",
  string
> = {
  semanal: "da semana",
  quinzenal: "da quinzena",
  mensal: "do mês",
};

/**
 * The app-wide base template catalog lives in
 * `drizzle/data/whatsapp-templates.json` and is loaded (server-side) by
 * `@/server/whatsapp/base-templates` — it's seed data, kept out of this
 * client-safe module. At runtime the effective catalog is read from the DB via
 * the resolver (`resolveTemplate` / `listResolvedTemplates`), so nothing here
 * needs the raw list.
 */

/* -------------------------------------------------------------------------- */
/*  DTOs (API ↔ UI)                                                           */
/* -------------------------------------------------------------------------- */

export type WhatsAppMessageDto = {
  id: string;
  direction: WhatsAppMessageDirection;
  type: WhatsAppMessageType;
  body: string;
  templateKey: string | null;
  status: WhatsAppMessageStatus;
  createdAt: string; // ISO
};

export type WhatsAppConversationDto = {
  id: string;
  studentId: string | null;
  /** Student display name, or the formatted number for unknown-number threads. */
  name: string;
  /** Two-letter avatar initials. */
  initials: string;
  /** Normalized phone (digits) + a display-formatted variant. */
  phone: string;
  phoneDisplay: string;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: WhatsAppMessageDirection | null;
  unreadCount: number;
  /** Derived server-side (also derivable client-side via isWindowOpen). */
  windowOpen: boolean;
};

export type WhatsAppTemplateDto = {
  id: string;
  key: string;
  title: string;
  body: string;
  status: WhatsAppTemplateStatus;
};

export type WhatsAppConnectionDto = {
  status: WhatsAppConnectionStatus;
  provider: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  metaAccountName: string | null;
  connectedAt: string | null;
};

/** The coach inbox list payload. */
export type WhatsAppInboxDto = {
  conversations: WhatsAppConversationDto[];
  templates: WhatsAppTemplateDto[];
  connection: WhatsAppConnectionDto;
  /**
   * Whether the active provider can actually deliver messages
   * (`getWhatsAppProvider().canDeliver`). It's `false` while the `dev` provider
   * is in use (no real vendor wired) — which drives the coach "under development
   * — nothing is really delivered yet" banner. Set by the route (runtime), not
   * the DAL.
   */
  deliveryEnabled: boolean;
};

/** A single conversation's full thread. */
export type WhatsAppThreadDto = {
  conversation: WhatsAppConversationDto;
  messages: WhatsAppMessageDto[];
};

/** One row of the admin per-tenant WhatsApp overview. */
export type AdminWhatsAppTenantDto = {
  clinicId: string;
  name: string;
  phoneDisplay: string | null;
  status: WhatsAppConnectionStatus;
  messagesThisMonth: number;
  openWindows: number;
};

/** The admin overview payload (KPIs + per-tenant rows). */
export type AdminWhatsAppOverviewDto = {
  tenants: AdminWhatsAppTenantDto[];
  connectedCount: number;
  totalMessagesThisMonth: number;
  totalOpenWindows: number;
};

/* -------------------------------------------------------------------------- */
/*  zod input schemas                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The send payload: either a free-text message (`type: "text"` + `body`) or a
 * template (`type: "template"` + `templateKey`). A refine keeps the discriminated
 * fields honest; the DAL additionally enforces the 24h window and template
 * approval before anything is sent.
 */
export const whatsappSendSchema = z
  .object({
    type: z.enum(WHATSAPP_MESSAGE_TYPES),
    body: z.string().trim().min(1).max(4096).optional(),
    templateKey: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => (v.type === "text" ? !!v.body : true), {
    message: "Escreva uma mensagem.",
    path: ["body"],
  })
  .refine((v) => (v.type === "template" ? !!v.templateKey : true), {
    message: "Selecione um template.",
    path: ["templateKey"],
  });
export type WhatsAppSendInput = z.infer<typeof whatsappSendSchema>;

/**
 * The dev simulate-inbound payload — deliberately just `{ phone, body }`. No
 * `studentId`: a real webhook only ever gives you the sender's number, so the
 * student is always resolved by phone, exactly as production will.
 */
export const whatsappSimulateInboundSchema = z.object({
  phone: z.string().trim().min(8).max(24),
  body: z.string().trim().min(1).max(4096),
});
export type WhatsAppSimulateInboundInput = z.infer<
  typeof whatsappSimulateInboundSchema
>;
