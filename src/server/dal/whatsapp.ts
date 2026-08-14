import { and, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";

import { schema, type DB } from "@/db";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { captureOutbox } from "@/lib/test-outbox";
import { studentInitials } from "@/lib/students";
import {
  isWindowOpen,
  renderTemplate,
  WHATSAPP_WINDOW_MS,
  type AdminWhatsAppOverviewDto,
  type TemplateVars,
  type WhatsAppConnectionDto,
  type WhatsAppConversationDto,
  type WhatsAppInboxDto,
  type WhatsAppMessageDto,
  type WhatsAppSendInput,
  type WhatsAppTemplateDto,
  type WhatsAppThreadDto,
} from "@/lib/whatsapp-inbox";
import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
import type { TenantContext } from "@/server/tenant";
import { createNotification } from "./notifications";

/**
 * WhatsApp inbox access. Clinic-scoped — every query filters by `ctx.clinicId`,
 * derived from the session, never from client input (the plan gate,
 * `canUseWhatsapp`, is enforced one layer up in the route). Conversations are
 * shared clinic-wide, like every other domain table.
 *
 * The one WhatsApp rule enforced here: free-text (`type: "text"`) may be sent
 * only while the 24h customer-service window is open (derived live from the
 * conversation's `lastInboundAt`); outside it, only an **approved** template may
 * go out. Both `sendMessage` (outbound) and `ingestInboundMessage` (inbound,
 * shared by the real webhook and the dev simulate endpoint) update the
 * denormalized `last*` columns so the list renders without touching the message
 * table. Delivery itself goes through the provider port — the dev provider logs
 * and never delivers, so outbound persists as `sent`.
 */

/** Domain errors the routes map to friendly 422 messages. */
export class WhatsAppSendError extends Error {
  constructor(readonly code: "window_closed" | "invalid_template") {
    super(code);
    this.name = "WhatsAppSendError";
  }
}

export class WhatsAppInboundError extends Error {
  constructor(readonly code: "invalid_phone") {
    super(code);
    this.name = "WhatsAppInboundError";
  }
}

/** A single-line preview of a body for the conversation list. */
function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 89)}…` : oneLine;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** The row shape shared by conversation reads (conversation + optional student). */
type ConversationRow = {
  id: string;
  studentId: string | null;
  phone: string;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastMessageDirection: WhatsAppConversationDto["lastMessageDirection"];
  unreadCount: number;
  studentFirst: string | null;
  studentLast: string | null;
};

function toConversationDto(
  r: ConversationRow,
  now: number,
): WhatsAppConversationDto {
  const named = r.studentId && r.studentFirst && r.studentLast;
  const lastInboundAt = toIso(r.lastInboundAt);
  return {
    id: r.id,
    studentId: r.studentId,
    name: named
      ? `${r.studentFirst} ${r.studentLast}`
      : formatPhone(r.phone) || r.phone,
    initials: named
      ? studentInitials(r.studentFirst!, r.studentLast!)
      : r.phone.slice(-2),
    phone: r.phone,
    phoneDisplay: formatPhone(r.phone) || r.phone,
    lastInboundAt,
    lastMessageAt: toIso(r.lastMessageAt),
    lastMessagePreview: r.lastMessagePreview,
    lastMessageDirection: r.lastMessageDirection,
    unreadCount: r.unreadCount,
    windowOpen: isWindowOpen(lastInboundAt, now),
  };
}

const conversationColumns = {
  id: schema.whatsappConversation.id,
  studentId: schema.whatsappConversation.studentId,
  phone: schema.whatsappConversation.phone,
  lastInboundAt: schema.whatsappConversation.lastInboundAt,
  lastMessageAt: schema.whatsappConversation.lastMessageAt,
  lastMessagePreview: schema.whatsappConversation.lastMessagePreview,
  lastMessageDirection: schema.whatsappConversation.lastMessageDirection,
  unreadCount: schema.whatsappConversation.unreadCount,
  studentFirst: schema.students.firstName,
  studentLast: schema.students.lastName,
} as const;

function toMessageDto(r: {
  id: string;
  direction: WhatsAppMessageDto["direction"];
  type: WhatsAppMessageDto["type"];
  body: string;
  templateKey: string | null;
  status: WhatsAppMessageDto["status"];
  createdAt: Date;
}): WhatsAppMessageDto {
  return {
    id: r.id,
    direction: r.direction,
    type: r.type,
    body: r.body,
    templateKey: r.templateKey,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

const messageColumns = {
  id: schema.whatsappMessage.id,
  direction: schema.whatsappMessage.direction,
  type: schema.whatsappMessage.type,
  body: schema.whatsappMessage.body,
  templateKey: schema.whatsappMessage.templateKey,
  status: schema.whatsappMessage.status,
  createdAt: schema.whatsappMessage.createdAt,
} as const;

/** This clinic's connection, or a synthetic "disconnected" when there's no row. */
export async function getConnection(
  ctx: TenantContext,
): Promise<WhatsAppConnectionDto> {
  const [row] = await ctx.db
    .select()
    .from(schema.whatsappConnection)
    .where(eq(schema.whatsappConnection.clinicId, ctx.clinicId));

  if (!row) {
    return {
      status: "disconnected",
      provider: null,
      phone: null,
      phoneDisplay: null,
      metaAccountName: null,
      connectedAt: null,
    };
  }
  return {
    status: row.status,
    provider: row.provider,
    phone: row.phone,
    phoneDisplay: row.phone ? formatPhone(row.phone) : null,
    metaAccountName: row.metaAccountName,
    connectedAt: toIso(row.connectedAt),
  };
}

/** A template resolved for a clinic (clinic-specific row, else the base row). */
export type ResolvedTemplate = { key: string; title: string; body: string };

/**
 * Resolves ONE template `key` for a clinic: the clinic's own approved row if it
 * has one, else the app-wide **base** (`clinicId is null`) approved row, else
 * null. The single source of truth used by the composer send AND every event
 * automation — so all of them are "aware" of base + clinic templates.
 */
export async function resolveTemplate(
  ctx: TenantContext,
  key: string,
): Promise<ResolvedTemplate | null> {
  const rows = await ctx.db
    .select({
      key: schema.whatsappTemplate.key,
      title: schema.whatsappTemplate.title,
      body: schema.whatsappTemplate.body,
      clinicId: schema.whatsappTemplate.clinicId,
    })
    .from(schema.whatsappTemplate)
    .where(
      and(
        eq(schema.whatsappTemplate.key, key),
        eq(schema.whatsappTemplate.status, "approved"),
        or(
          isNull(schema.whatsappTemplate.clinicId),
          eq(schema.whatsappTemplate.clinicId, ctx.clinicId),
        ),
      ),
    );
  // Prefer the clinic's own row over the base row.
  const chosen = rows.find((r) => r.clinicId === ctx.clinicId) ?? rows[0];
  return chosen
    ? { key: chosen.key, title: chosen.title, body: chosen.body }
    : null;
}

/**
 * The effective approved template catalog for a clinic: every base template,
 * with a clinic-specific row overriding the base of the same `key`. Sorted by
 * title. Powers the composer's template picker.
 */
export async function listResolvedTemplates(
  ctx: TenantContext,
): Promise<WhatsAppTemplateDto[]> {
  const rows = await ctx.db
    .select({
      id: schema.whatsappTemplate.id,
      key: schema.whatsappTemplate.key,
      title: schema.whatsappTemplate.title,
      body: schema.whatsappTemplate.body,
      status: schema.whatsappTemplate.status,
      clinicId: schema.whatsappTemplate.clinicId,
    })
    .from(schema.whatsappTemplate)
    .where(
      and(
        eq(schema.whatsappTemplate.status, "approved"),
        or(
          isNull(schema.whatsappTemplate.clinicId),
          eq(schema.whatsappTemplate.clinicId, ctx.clinicId),
        ),
      ),
    );

  // Clinic row wins over the base row for the same key.
  const byKey = new Map<string, WhatsAppTemplateDto>();
  for (const r of rows) {
    const existing = byKey.get(r.key);
    if (!existing || r.clinicId === ctx.clinicId) {
      byKey.set(r.key, {
        id: r.id,
        key: r.key,
        title: r.title,
        body: r.body,
        status: r.status,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR"),
  );
}

/**
 * The coach inbox: conversations (newest first) + templates + connection. The
 * `deliveryEnabled` flag is added by the route (runtime provider), not here.
 */
export async function getInbox(
  ctx: TenantContext,
): Promise<Omit<WhatsAppInboxDto, "deliveryEnabled">> {
  const now = Date.now();
  const rows = await ctx.db
    .select(conversationColumns)
    .from(schema.whatsappConversation)
    .leftJoin(
      schema.students,
      eq(schema.students.id, schema.whatsappConversation.studentId),
    )
    .where(eq(schema.whatsappConversation.clinicId, ctx.clinicId))
    .orderBy(desc(schema.whatsappConversation.lastMessageAt));

  return {
    conversations: rows.map((r) => toConversationDto(r, now)),
    templates: await listResolvedTemplates(ctx),
    connection: await getConnection(ctx),
  };
}

/** A single conversation's full thread, or null if it isn't in this clinic. */
export async function getThread(
  ctx: TenantContext,
  conversationId: string,
): Promise<WhatsAppThreadDto | null> {
  const [conv] = await ctx.db
    .select(conversationColumns)
    .from(schema.whatsappConversation)
    .leftJoin(
      schema.students,
      eq(schema.students.id, schema.whatsappConversation.studentId),
    )
    .where(
      and(
        eq(schema.whatsappConversation.id, conversationId),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    );
  if (!conv) return null;

  const messages = await ctx.db
    .select(messageColumns)
    .from(schema.whatsappMessage)
    .where(
      and(
        eq(schema.whatsappMessage.clinicId, ctx.clinicId),
        eq(schema.whatsappMessage.conversationId, conversationId),
      ),
    )
    .orderBy(schema.whatsappMessage.createdAt);

  return {
    conversation: toConversationDto(conv, Date.now()),
    messages: messages.map(toMessageDto),
  };
}

/** Marks a conversation read (unread → 0). Returns false if not in this clinic. */
export async function markRead(
  ctx: TenantContext,
  conversationId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .update(schema.whatsappConversation)
    .set({ unreadCount: 0, updatedAt: new Date() })
    .where(
      and(
        eq(schema.whatsappConversation.id, conversationId),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    )
    .returning({ id: schema.whatsappConversation.id });
  return rows.length > 0;
}

/**
 * Sends an outbound message on a conversation. Enforces the 24h window for
 * free-text and template approval, delegates delivery to the provider port,
 * persists the message (status `sent`), and updates the conversation preview.
 * Returns null if the conversation isn't in this clinic (404); throws
 * `WhatsAppSendError` on a closed window or an unapproved/unknown template.
 */
export async function sendMessage(
  ctx: TenantContext,
  conversationId: string,
  input: WhatsAppSendInput,
): Promise<WhatsAppMessageDto | null> {
  const [conv] = await ctx.db
    .select({
      id: schema.whatsappConversation.id,
      phone: schema.whatsappConversation.phone,
      lastInboundAt: schema.whatsappConversation.lastInboundAt,
      studentFirst: schema.students.firstName,
    })
    .from(schema.whatsappConversation)
    .leftJoin(
      schema.students,
      eq(schema.students.id, schema.whatsappConversation.studentId),
    )
    .where(
      and(
        eq(schema.whatsappConversation.id, conversationId),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    );
  if (!conv) return null;

  const provider = getWhatsAppProvider();
  let renderedBody: string;
  let templateKey: string | null = null;
  let providerMessageId: string | undefined;

  if (input.type === "text") {
    if (!isWindowOpen(toIso(conv.lastInboundAt))) {
      throw new WhatsAppSendError("window_closed");
    }
    renderedBody = input.body!.trim();
    ({ providerMessageId } = await provider.sendSessionMessage(
      conv.phone,
      renderedBody,
    ));
  } else {
    // Resolve clinic-specific → base by key (approved only).
    const tpl = await resolveTemplate(ctx, input.templateKey!);
    if (!tpl) throw new WhatsAppSendError("invalid_template");
    templateKey = tpl.key;
    renderedBody = renderTemplate(tpl.body, {
      nome: conv.studentFirst ?? undefined,
    });
    ({ providerMessageId } = await provider.sendTemplateMessage(
      conv.phone,
      tpl.key,
      renderedBody,
    ));
  }

  const now = new Date();
  const [msg] = await ctx.db
    .insert(schema.whatsappMessage)
    .values({
      clinicId: ctx.clinicId,
      conversationId,
      direction: "outbound",
      type: input.type,
      body: renderedBody,
      templateKey,
      status: "sent",
      providerMessageId: providerMessageId ?? null,
      createdByUserId: ctx.userId,
    })
    .returning(messageColumns);

  // Outbound never touches lastInboundAt (the window) or unreadCount.
  await ctx.db
    .update(schema.whatsappConversation)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview(renderedBody),
      lastMessageDirection: "outbound",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.whatsappConversation.id, conversationId),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    );

  return toMessageDto(msg);
}

/**
 * Sends an approved template to a student on behalf of the clinic — the path
 * every EVENT AUTOMATION uses (welcome on invite, check-in feedback, diet /
 * workout published, the scheduled check-in reminder). Resolves the template
 * (clinic → base) by `key`, finds/creates the student's conversation, renders
 * `{nome}`/`{periodo}`/`{link}` (nome defaults to the student's first name),
 * and sends it. Templates bypass the 24h window (that's their purpose), so this
 * never checks the window. Returns null if the student has no phone or the
 * template can't be resolved (the automation just no-ops).
 *
 * The plan gate (`canUseWhatsapp`) is the CALLER's responsibility. Any `{link}`
 * is also captured to the test-outbox so the invite→accept e2e keeps working;
 * `outboxKind` overrides the capture label (defaults to the template `key`) for
 * callers that replaced a legacy free-text send whose outbox kind is asserted.
 */
export async function sendTemplateToStudent(
  ctx: TenantContext,
  studentId: string,
  key: string,
  vars: TemplateVars = {},
  outboxKind: string = key,
): Promise<{ conversationId: string; messageId: string } | null> {
  const [student] = await ctx.db
    .select({
      phone: schema.students.phone,
      firstName: schema.students.firstName,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.clinicId, ctx.clinicId),
      ),
    );
  if (!student?.phone) return null;

  const tpl = await resolveTemplate(ctx, key);
  if (!tpl) return null;

  const renderedBody = renderTemplate(tpl.body, {
    nome: vars.nome ?? student.firstName,
    periodo: vars.periodo,
    link: vars.link,
  });

  // Surface any actionable link to the test outbox (e2e reads invite links).
  if (vars.link) {
    captureOutbox({
      to: student.phone,
      subject: "WhatsApp",
      kind: outboxKind,
      url: vars.link,
    });
  }

  const { providerMessageId } = await getWhatsAppProvider().sendTemplateMessage(
    student.phone,
    tpl.key,
    renderedBody,
  );

  // Find or create the conversation for this student's phone.
  let [conv] = await ctx.db
    .select({ id: schema.whatsappConversation.id })
    .from(schema.whatsappConversation)
    .where(
      and(
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
        eq(schema.whatsappConversation.phone, student.phone),
      ),
    );
  if (!conv) {
    const [created] = await ctx.db
      .insert(schema.whatsappConversation)
      .values({ clinicId: ctx.clinicId, studentId, phone: student.phone })
      .returning({ id: schema.whatsappConversation.id });
    conv = created;
  }

  const now = new Date();
  const [msg] = await ctx.db
    .insert(schema.whatsappMessage)
    .values({
      clinicId: ctx.clinicId,
      conversationId: conv.id,
      direction: "outbound",
      type: "template",
      body: renderedBody,
      templateKey: tpl.key,
      status: "sent",
      providerMessageId: providerMessageId ?? null,
      createdByUserId: ctx.userId,
    })
    .returning({ id: schema.whatsappMessage.id });

  await ctx.db
    .update(schema.whatsappConversation)
    .set({
      lastMessageAt: now,
      lastMessagePreview: preview(renderedBody),
      lastMessageDirection: "outbound",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.whatsappConversation.id, conv.id),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    );

  return { conversationId: conv.id, messageId: msg.id };
}

/**
 * Ingests an inbound message — the shared path for the real webhook and the dev
 * simulate endpoint. Resolves the thread by normalized phone (creating it, and
 * linking a student whose number matches, when absent), appends the inbound
 * message, and **reopens the 24h window** (`lastInboundAt = now`) while bumping
 * the unread counter. The student is always derived from the phone — never
 * passed in — exactly as a production webhook will behave.
 */
export async function ingestInboundMessage(
  ctx: TenantContext,
  event: { from: string; body: string; providerMessageId?: string },
): Promise<{ conversationId: string }> {
  const phone = normalizePhone(event.from);
  if (!phone) throw new WhatsAppInboundError("invalid_phone");

  let [conv] = await ctx.db
    .select({
      id: schema.whatsappConversation.id,
      unreadCount: schema.whatsappConversation.unreadCount,
      studentId: schema.whatsappConversation.studentId,
    })
    .from(schema.whatsappConversation)
    .where(
      and(
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
        eq(schema.whatsappConversation.phone, phone),
      ),
    );

  // The matched student's name, resolved once, for the notification below.
  let contactName: string | null = null;

  if (!conv) {
    const [student] = await ctx.db
      .select({
        id: schema.students.id,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
      })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.clinicId, ctx.clinicId),
          eq(schema.students.phone, phone),
        ),
      );
    const [created] = await ctx.db
      .insert(schema.whatsappConversation)
      .values({
        clinicId: ctx.clinicId,
        studentId: student?.id ?? null,
        phone,
      })
      .returning({ id: schema.whatsappConversation.id });
    conv = { id: created.id, unreadCount: 0, studentId: student?.id ?? null };
    if (student) contactName = `${student.firstName} ${student.lastName}`;
  }

  // Coalesce the bell: only notify when the thread transitions 0 → unread, so a
  // rapid back-and-forth rings once (until the coach opens it, resetting unread).
  const wasUnreadZero = conv.unreadCount === 0;

  const now = new Date();
  await ctx.db.insert(schema.whatsappMessage).values({
    clinicId: ctx.clinicId,
    conversationId: conv.id,
    direction: "inbound",
    type: "text",
    body: event.body,
    status: "delivered",
    providerMessageId: event.providerMessageId ?? null,
  });

  await ctx.db
    .update(schema.whatsappConversation)
    .set({
      lastInboundAt: now,
      lastMessageAt: now,
      lastMessagePreview: preview(event.body),
      lastMessageDirection: "inbound",
      unreadCount: sql`${schema.whatsappConversation.unreadCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.whatsappConversation.id, conv.id),
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
      ),
    );

  if (wasUnreadZero) {
    // Resolve the contact's display name (student name, else formatted phone).
    if (!contactName && conv.studentId) {
      const [s] = await ctx.db
        .select({
          firstName: schema.students.firstName,
          lastName: schema.students.lastName,
        })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.id, conv.studentId),
            eq(schema.students.clinicId, ctx.clinicId),
          ),
        );
      if (s) contactName = `${s.firstName} ${s.lastName}`;
    }
    await createNotification(ctx.db, {
      clinicId: ctx.clinicId,
      type: "whatsapp_received",
      data: {
        conversationId: conv.id,
        studentId: conv.studentId,
        contactName: contactName ?? (formatPhone(phone) || phone),
        preview: preview(event.body),
      },
    });
  }

  return { conversationId: conv.id };
}

/**
 * Conversations awaiting a coach reply (unanswered inbound) for the dashboard
 * "WhatsApp aguardando" widget, newest first. Empty for a clinic with no
 * WhatsApp activity (e.g. a Free clinic).
 */
export async function listWaiting(
  ctx: TenantContext,
  limit = 5,
): Promise<WhatsAppConversationDto[]> {
  const now = Date.now();
  const rows = await ctx.db
    .select(conversationColumns)
    .from(schema.whatsappConversation)
    .leftJoin(
      schema.students,
      eq(schema.students.id, schema.whatsappConversation.studentId),
    )
    .where(
      and(
        eq(schema.whatsappConversation.clinicId, ctx.clinicId),
        gte(schema.whatsappConversation.unreadCount, 1),
      ),
    )
    .orderBy(desc(schema.whatsappConversation.lastMessageAt))
    .limit(limit);
  return rows.map((r) => toConversationDto(r, now));
}

/**
 * The platform-admin per-tenant WhatsApp overview — the ONE cross-tenant read
 * here (guarded by `getAdminSession()` in its route, not by a TenantContext).
 * Per clinic: connection status + display number (from `whatsapp_connection`),
 * messages this calendar month, and currently-open 24h windows — both computed
 * live from the message/conversation tables.
 */
export async function getAdminOverview(
  db: DB,
): Promise<AdminWhatsAppOverviewDto> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowThreshold = new Date(now.getTime() - WHATSAPP_WINDOW_MS);

  const clinics = await db
    .select({ id: schema.clinic.id, name: schema.clinic.name })
    .from(schema.clinic);

  const connections = await db
    .select({
      clinicId: schema.whatsappConnection.clinicId,
      status: schema.whatsappConnection.status,
      phone: schema.whatsappConnection.phone,
    })
    .from(schema.whatsappConnection);
  const connByClinic = new Map(connections.map((c) => [c.clinicId, c]));

  const msgCounts = await db
    .select({
      clinicId: schema.whatsappMessage.clinicId,
      n: count(),
    })
    .from(schema.whatsappMessage)
    .where(gte(schema.whatsappMessage.createdAt, monthStart))
    .groupBy(schema.whatsappMessage.clinicId);
  const msgByClinic = new Map(msgCounts.map((m) => [m.clinicId, m.n]));

  const winCounts = await db
    .select({
      clinicId: schema.whatsappConversation.clinicId,
      n: count(),
    })
    .from(schema.whatsappConversation)
    .where(gte(schema.whatsappConversation.lastInboundAt, windowThreshold))
    .groupBy(schema.whatsappConversation.clinicId);
  const winByClinic = new Map(winCounts.map((w) => [w.clinicId, w.n]));

  const tenants = clinics
    .map((c) => {
      const conn = connByClinic.get(c.id);
      return {
        clinicId: c.id,
        name: c.name,
        phoneDisplay: conn?.phone ? formatPhone(conn.phone) : null,
        status: conn?.status ?? ("disconnected" as const),
        messagesThisMonth: msgByClinic.get(c.id) ?? 0,
        openWindows: winByClinic.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return {
    tenants,
    connectedCount: tenants.filter((t) => t.status === "connected").length,
    totalMessagesThisMonth: tenants.reduce(
      (s, t) => s + t.messagesThisMonth,
      0,
    ),
    totalOpenWindows: tenants.reduce((s, t) => s + t.openWindows, 0),
  };
}
