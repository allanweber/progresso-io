// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { isWindowOpen } from "@/lib/whatsapp-inbox";
import { plans, whatsapp } from "@/server/dal";
import {
  WhatsAppInboundError,
  WhatsAppSendError,
} from "@/server/dal/whatsapp";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

async function ownerContext(
  email: string,
  plan: schema.Plan,
): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name: "Owner", email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.clinic)
    .set({ plan })
    .where(eq(schema.clinic.id, user.clinicId!));
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

async function addStudent(
  ctx: TenantContext,
  phone: string,
  firstName = "Ana",
  lastName = "Silva",
): Promise<string> {
  const [s] = await db
    .insert(schema.students)
    .values({
      clinicId: ctx.clinicId,
      firstName,
      lastName,
      phone: normalizePhone(phone),
      status: "active",
    })
    .returning({ id: schema.students.id });
  return s.id;
}

async function addTemplate(ctx: TenantContext, approved = true) {
  await db.insert(schema.whatsappTemplate).values({
    clinicId: ctx.clinicId,
    key: "checkin_reminder",
    title: "Lembrete de check-in",
    body: "Oi {nome}! Bora o check-in?",
    status: approved ? "approved" : "pending",
  });
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("whatsapp plan gate", () => {
  it("excludes Free and includes the paid plans", async () => {
    const free = await ownerContext("wa-free@example.com", "free");
    const solo = await ownerContext("wa-solo@example.com", "solo");
    expect(await plans.canUseWhatsapp(free)).toBe(false);
    expect(await plans.canUseWhatsapp(solo)).toBe(true);
  });
});

describe("inbound ingest", () => {
  it("creates a thread, links a student by phone, and opens the window", async () => {
    const ctx = await ownerContext("wa-ingest@example.com", "clinica");
    const studentId = await addStudent(ctx, "11999990000");

    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "+55 11 99999-0000",
      body: "Oi coach!",
    });

    const thread = await whatsapp.getThread(ctx, conversationId);
    expect(thread).not.toBeNull();
    expect(thread!.conversation.studentId).toBe(studentId);
    expect(thread!.conversation.unreadCount).toBe(1);
    expect(thread!.conversation.windowOpen).toBe(true);
    expect(isWindowOpen(thread!.conversation.lastInboundAt)).toBe(true);
    expect(thread!.messages).toHaveLength(1);
    expect(thread!.messages[0].direction).toBe("inbound");

    // A second inbound reuses the same thread and bumps unread.
    const again = await whatsapp.ingestInboundMessage(ctx, {
      from: "5511999990000",
      body: "Ainda tá aí?",
    });
    expect(again.conversationId).toBe(conversationId);
    const thread2 = await whatsapp.getThread(ctx, conversationId);
    // getThread marks nothing; unread was bumped to 2 by the second inbound.
    expect(thread2!.conversation.unreadCount).toBe(2);
    expect(thread2!.messages).toHaveLength(2);
  });

  it("keeps an unknown number as an unlinked thread", async () => {
    const ctx = await ownerContext("wa-unknown@example.com", "clinica");
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11955554444",
      body: "Olá, quero treinar!",
    });
    const thread = await whatsapp.getThread(ctx, conversationId);
    expect(thread!.conversation.studentId).toBeNull();
  });

  it("rejects an unusable phone number", async () => {
    const ctx = await ownerContext("wa-badphone@example.com", "clinica");
    await expect(
      whatsapp.ingestInboundMessage(ctx, { from: "abc", body: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppInboundError);
  });
});

describe("sending + the 24h window", () => {
  it("allows free-text only while the window is open", async () => {
    const ctx = await ownerContext("wa-window@example.com", "clinica");
    await addStudent(ctx, "11999991111");
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11999991111",
      body: "oi",
    });

    // Window open → free-text succeeds, persists as an outbound "sent".
    const msg = await whatsapp.sendMessage(ctx, conversationId, {
      type: "text",
      body: "Fala, Ana! 🔥",
    });
    expect(msg).not.toBeNull();
    expect(msg!.direction).toBe("outbound");
    expect(msg!.status).toBe("sent");

    // Force the window closed (last inbound 30h ago).
    await db
      .update(schema.whatsappConversation)
      .set({ lastInboundAt: new Date(Date.now() - 30 * 60 * 60 * 1000) })
      .where(eq(schema.whatsappConversation.id, conversationId));

    await expect(
      whatsapp.sendMessage(ctx, conversationId, {
        type: "text",
        body: "ainda aberto?",
      }),
    ).rejects.toMatchObject({ code: "window_closed" });
  });

  it("sends an approved template even when the window is closed, rendering {nome}", async () => {
    const ctx = await ownerContext("wa-template@example.com", "clinica");
    await addStudent(ctx, "11999992222", "Bruno");
    await addTemplate(ctx, true);
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11999992222",
      body: "oi",
    });
    await db
      .update(schema.whatsappConversation)
      .set({ lastInboundAt: new Date(Date.now() - 30 * 60 * 60 * 1000) })
      .where(eq(schema.whatsappConversation.id, conversationId));

    const msg = await whatsapp.sendMessage(ctx, conversationId, {
      type: "template",
      templateKey: "checkin_reminder",
    });
    expect(msg!.type).toBe("template");
    expect(msg!.body).toBe("Oi Bruno! Bora o check-in?");
  });

  it("rejects an unknown or unapproved template", async () => {
    const ctx = await ownerContext("wa-badtpl@example.com", "clinica");
    await addStudent(ctx, "11999993333");
    await addTemplate(ctx, false); // pending, not approved
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11999993333",
      body: "oi",
    });
    await expect(
      whatsapp.sendMessage(ctx, conversationId, {
        type: "template",
        templateKey: "checkin_reminder",
      }),
    ).rejects.toMatchObject({ code: "invalid_template" });
    await expect(
      whatsapp.sendMessage(ctx, conversationId, {
        type: "template",
        templateKey: "does_not_exist",
      }),
    ).rejects.toBeInstanceOf(WhatsAppSendError);
  });
});

describe("tenant isolation + read state", () => {
  it("never exposes another clinic's conversation", async () => {
    const a = await ownerContext("wa-iso-a@example.com", "clinica");
    const b = await ownerContext("wa-iso-b@example.com", "clinica");
    const { conversationId } = await whatsapp.ingestInboundMessage(a, {
      from: "11900000001",
      body: "segredo A",
    });

    expect(await whatsapp.getThread(b, conversationId)).toBeNull();
    expect(await whatsapp.sendMessage(b, conversationId, {
      type: "text",
      body: "invadindo",
    })).toBeNull();
    expect(await whatsapp.markRead(b, conversationId)).toBe(false);

    const bInbox = await whatsapp.getInbox(b);
    expect(bInbox.conversations).toHaveLength(0);
  });

  it("markRead clears unread; listWaiting surfaces unanswered threads", async () => {
    const ctx = await ownerContext("wa-read@example.com", "clinica");
    await addStudent(ctx, "11900000002");
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11900000002",
      body: "responde aí",
    });

    const waiting = await whatsapp.listWaiting(ctx);
    expect(waiting.some((c) => c.id === conversationId)).toBe(true);

    expect(await whatsapp.markRead(ctx, conversationId)).toBe(true);
    const afterRead = await whatsapp.listWaiting(ctx);
    expect(afterRead.some((c) => c.id === conversationId)).toBe(false);
  });
});

describe("admin overview", () => {
  it("reports per-tenant connection + live counts", async () => {
    const ctx = await ownerContext("wa-admin@example.com", "clinica");
    await db.insert(schema.whatsappConnection).values({
      clinicId: ctx.clinicId,
      provider: "meta",
      status: "connected",
      phone: normalizePhone("1130000009"),
      connectedAt: new Date(),
    });
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11900000003",
      body: "conta essa msg",
    });

    const overview = await whatsapp.getAdminOverview(h);
    const row = overview.tenants.find((t) => t.clinicId === ctx.clinicId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("connected");
    expect(row!.messagesThisMonth).toBeGreaterThanOrEqual(1);
    expect(row!.openWindows).toBeGreaterThanOrEqual(1);
    expect(overview.connectedCount).toBeGreaterThanOrEqual(1);
  });
});
