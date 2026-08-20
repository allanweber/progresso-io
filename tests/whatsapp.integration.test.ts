// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import type { Weekday } from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { WEEKDAY_INDEX, weekdayOf } from "@/lib/calendar";
import { normalizePhone } from "@/lib/phone";
import { isWindowOpen } from "@/lib/whatsapp-inbox";
import { plans, students as studentsDal, whatsapp } from "@/server/dal";
import {
  WhatsAppInboundError,
  WhatsAppSendError,
} from "@/server/dal/whatsapp";
import { runCheckinReminders } from "@/server/whatsapp-automations";
import type { TenantContext } from "@/server/tenant";

import { clearTrial, createTestDb, type TestDb } from "./pglite";

/** The schema `Weekday` name for a `YYYY-MM-DD` (mirrors the automation). */
function weekdayNameOf(ymd: string): Weekday {
  const idx = weekdayOf(ymd);
  return (Object.keys(WEEKDAY_INDEX) as Weekday[]).find(
    (w) => WEEKDAY_INDEX[w] === idx,
  )!;
}

/** Inserts a base (app-wide, `clinicId = null`) approved template. */
async function addBaseTemplate(key: string, title: string, body: string) {
  await db
    .insert(schema.whatsappTemplate)
    .values({ clinicId: null, key, title, body, status: "approved" })
    .onConflictDoNothing();
}

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
  // These suites assert PLAN gates/caps, so drop the sign-up trial —
  // otherwise a free clinic reads as Solo while it runs.
  await clearTrial(db, user.clinicId!);
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
    // The sidebar badge count mirrors listWaiting (uncapped) — 1 unanswered here.
    expect(await whatsapp.countWaiting(ctx)).toBe(1);

    expect(await whatsapp.markRead(ctx, conversationId)).toBe(true);
    const afterRead = await whatsapp.listWaiting(ctx);
    expect(afterRead.some((c) => c.id === conversationId)).toBe(false);
    expect(await whatsapp.countWaiting(ctx)).toBe(0);
  });
});

describe("bell notification (coalesced)", () => {
  async function waNotifCount(clinicId: string): Promise<number> {
    const rows = await db
      .select({ id: schema.notification.id })
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.clinicId, clinicId),
          eq(schema.notification.type, "whatsapp_received"),
        ),
      );
    return rows.length;
  }

  it("rings once per 0→unread transition, not per message", async () => {
    const ctx = await ownerContext("wa-notif@example.com", "clinica");
    await addStudent(ctx, "11900000010", "Ana");

    // First inbound: 0 → unread → one notification.
    const { conversationId } = await whatsapp.ingestInboundMessage(ctx, {
      from: "11900000010",
      body: "oi coach",
    });
    expect(await waNotifCount(ctx.clinicId)).toBe(1);

    // Second inbound while still unread → coalesced, no new notification.
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11900000010",
      body: "ainda tá aí?",
    });
    expect(await waNotifCount(ctx.clinicId)).toBe(1);

    // Coach opens the thread (unread → 0); next inbound rings again.
    await whatsapp.markRead(ctx, conversationId);
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11900000010",
      body: "voltei",
    });
    expect(await waNotifCount(ctx.clinicId)).toBe(2);

    // The payload carries the student's name + a link target.
    const [row] = await db
      .select({ data: schema.notification.data })
      .from(schema.notification)
      .where(
        and(
          eq(schema.notification.clinicId, ctx.clinicId),
          eq(schema.notification.type, "whatsapp_received"),
        ),
      )
      .limit(1);
    expect((row.data as { contactName: string }).contactName).toContain("Ana");
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

describe("template resolution (base + clinic)", () => {
  it("resolves the base row, and a clinic override wins by key", async () => {
    const ctx = await ownerContext("wa-resolve@example.com", "clinica");
    await addBaseTemplate("diet_published", "Base", "Base: {nome}");

    // Only a base row exists → resolves to it.
    const base = await whatsapp.resolveTemplate(ctx, "diet_published");
    expect(base?.body).toBe("Base: {nome}");

    // A clinic-specific row with the same key overrides the base.
    await db.insert(schema.whatsappTemplate).values({
      clinicId: ctx.clinicId,
      key: "diet_published",
      title: "Clínica",
      body: "Clínica: {nome}",
      status: "approved",
    });
    const overridden = await whatsapp.resolveTemplate(ctx, "diet_published");
    expect(overridden?.body).toBe("Clínica: {nome}");

    // listResolvedTemplates carries exactly one row for the key (the override).
    const list = await whatsapp.listResolvedTemplates(ctx);
    const matches = list.filter((t) => t.key === "diet_published");
    expect(matches).toHaveLength(1);
    expect(matches[0].body).toBe("Clínica: {nome}");
  });

  it("ignores an unapproved clinic row and falls back to the base", async () => {
    const ctx = await ownerContext("wa-resolve-approved@example.com", "clinica");
    await addBaseTemplate("welcome_access", "Base", "Base welcome {link}");
    await db.insert(schema.whatsappTemplate).values({
      clinicId: ctx.clinicId,
      key: "welcome_access",
      title: "Pendente",
      body: "Rascunho",
      status: "pending",
    });
    const resolved = await whatsapp.resolveTemplate(ctx, "welcome_access");
    expect(resolved?.body).toBe("Base welcome {link}");
  });

  it("does not leak another clinic's template", async () => {
    const a = await ownerContext("wa-resolve-iso-a@example.com", "clinica");
    const b = await ownerContext("wa-resolve-iso-b@example.com", "clinica");
    await db.insert(schema.whatsappTemplate).values({
      clinicId: a.clinicId,
      key: "session_confirm",
      title: "A only",
      body: "A: {nome}",
      status: "approved",
    });
    expect(await whatsapp.resolveTemplate(b, "session_confirm")).toBeNull();
  });
});

describe("sendTemplateToStudent", () => {
  it("renders {nome}/{link}, records an outbound template, and reuses the thread", async () => {
    const ctx = await ownerContext("wa-send-tpl@example.com", "clinica");
    const studentId = await addStudent(ctx, "11966660001", "Carla");
    await addBaseTemplate(
      "checkin_feedback",
      "Retorno",
      "{nome}, veja seu retorno: {link}",
    );

    const sent = await whatsapp.sendTemplateToStudent(
      ctx,
      studentId,
      "checkin_feedback",
      { link: "https://app/x" },
    );
    expect(sent).not.toBeNull();

    const thread = await whatsapp.getThread(ctx, sent!.conversationId);
    expect(thread!.messages).toHaveLength(1);
    expect(thread!.messages[0].direction).toBe("outbound");
    expect(thread!.messages[0].type).toBe("template");
    expect(thread!.messages[0].templateKey).toBe("checkin_feedback");
    expect(thread!.messages[0].body).toBe("Carla, veja seu retorno: https://app/x");
    // A template send never opens the window nor bumps unread.
    expect(thread!.conversation.windowOpen).toBe(false);
    expect(thread!.conversation.unreadCount).toBe(0);

    // A second send reuses the same conversation.
    const again = await whatsapp.sendTemplateToStudent(
      ctx,
      studentId,
      "checkin_feedback",
      { link: "https://app/y" },
    );
    expect(again!.conversationId).toBe(sent!.conversationId);
  });

  it("no-ops (null) when the student has no phone or the template is unknown", async () => {
    const ctx = await ownerContext("wa-send-tpl-none@example.com", "clinica");
    const [noPhone] = await db
      .insert(schema.students)
      .values({
        clinicId: ctx.clinicId,
        firstName: "Sem",
        lastName: "Fone",
        phone: null,
        status: "active",
      })
      .returning({ id: schema.students.id });
    await addBaseTemplate("diet_published", "D", "{nome}, dieta no ar");

    expect(
      await whatsapp.sendTemplateToStudent(ctx, noPhone.id, "diet_published"),
    ).toBeNull();

    const withPhone = await addStudent(ctx, "11966660002");
    expect(
      await whatsapp.sendTemplateToStudent(ctx, withPhone, "does_not_exist"),
    ).toBeNull();
  });
});

describe("scheduled check-in reminders", () => {
  // A date whose weekday we align the clinic's preferred day to. Deliberately a
  // Tuesday — NOT the schema default (`monday`) — so the other test clinics
  // (which keep the default preferred day) are never swept in. Kept in the
  // recent past so the dedupe window (message timestamps are real "now") holds.
  const today = "2026-08-11";

  /** A clinic whose preferred check-in day is `today`, with one overdue student. */
  async function setupClinic(email: string, plan: schema.Plan) {
    const ctx = await ownerContext(email, plan);
    await db
      .update(schema.clinic)
      .set({
        feedbackPreferredDay: weekdayNameOf(today),
        feedbackFrequency: "semanal",
      })
      .where(eq(schema.clinic.id, ctx.clinicId));
    const studentId = await addStudent(ctx, "11955550001", "Dora");
    // Registered long ago, never checked in → overdue for a weekly check-in.
    await db
      .update(schema.students)
      .set({ createdAt: new Date("2026-01-05T12:00:00Z") })
      .where(eq(schema.students.id, studentId));
    return { ctx, studentId };
  }

  it("messages a due student once, then dedupes within the cadence period", async () => {
    await addBaseTemplate(
      "checkin_reminder",
      "Lembrete",
      "Oi {nome}! Check-in {periodo}?",
    );
    const { ctx, studentId } = await setupClinic("wa-cron@example.com", "clinica");

    const first = await runCheckinReminders(h, today);
    expect(first.remindersSent).toBeGreaterThanOrEqual(1);

    // The reminder landed as an outbound template on the student's thread.
    const [conv] = await db
      .select({ id: schema.whatsappConversation.id })
      .from(schema.whatsappConversation)
      .where(
        and(
          eq(schema.whatsappConversation.clinicId, ctx.clinicId),
          eq(schema.whatsappConversation.studentId, studentId),
        ),
      );
    const thread = await whatsapp.getThread(ctx, conv.id);
    expect(thread!.messages.some((m) => m.templateKey === "checkin_reminder")).toBe(
      true,
    );
    expect(thread!.messages[0].body).toBe("Oi Dora! Check-in da semana?");

    // Re-running the same day (within the period) sends nothing new.
    const countBefore = thread!.messages.length;
    await runCheckinReminders(h, today);
    const after = await whatsapp.getThread(ctx, conv.id);
    expect(after!.messages.length).toBe(countBefore);
  });

  it("skips clinics whose preferred day isn't today, and Free clinics", async () => {
    await addBaseTemplate(
      "checkin_reminder",
      "Lembrete",
      "Oi {nome}! Check-in {periodo}?",
    );

    // Different preferred day → not processed at all.
    const other = await ownerContext("wa-cron-otherday@example.com", "clinica");
    const otherDay = weekdayNameOf("2026-08-12"); // the day AFTER `today`
    await db
      .update(schema.clinic)
      .set({ feedbackPreferredDay: otherDay })
      .where(eq(schema.clinic.id, other.clinicId));
    const otherStudent = await addStudent(other, "11955550009", "Zed");
    await db
      .update(schema.students)
      .set({ createdAt: new Date("2026-01-05T12:00:00Z") })
      .where(eq(schema.students.id, otherStudent));

    // Free clinic on the right day → gated out.
    const free = await ownerContext("wa-cron-free@example.com", "free");
    await db
      .update(schema.clinic)
      .set({ feedbackPreferredDay: weekdayNameOf(today) })
      .where(eq(schema.clinic.id, free.clinicId));
    const freeStudent = await addStudent(free, "11955550008", "Gil");
    await db
      .update(schema.students)
      .set({ createdAt: new Date("2026-01-05T12:00:00Z") })
      .where(eq(schema.students.id, freeStudent));

    await runCheckinReminders(h, today);

    for (const clinicId of [other.clinicId, free.clinicId]) {
      const rows = await db
        .select({ id: schema.whatsappMessage.id })
        .from(schema.whatsappMessage)
        .where(
          and(
            eq(schema.whatsappMessage.clinicId, clinicId),
            eq(schema.whatsappMessage.templateKey, "checkin_reminder"),
          ),
        );
      expect(rows).toHaveLength(0);
    }
  });
});

describe("deleting an aluno removes their WhatsApp history", () => {
  it("deletes the conversation and its messages, and leaves other threads alone", async () => {
    const ctx = await ownerContext("wa-delete@example.com", "clinica");
    const doomedId = await addStudent(ctx, "11999990001", "Ana", "Some");
    const keptId = await addStudent(ctx, "11999990002", "Bia", "Fica");

    // Give both a real thread, inbound + outbound.
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11999990001",
      body: "Oi coach",
    });
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11999990002",
      body: "Bom dia",
    });

    const threadOf = async (studentId: string) => {
      const [row] = await db
        .select({ id: schema.whatsappConversation.id })
        .from(schema.whatsappConversation)
        .where(eq(schema.whatsappConversation.studentId, studentId));
      return row?.id;
    };
    const doomedThread = await threadOf(doomedId);
    const keptThread = await threadOf(keptId);
    expect(doomedThread).toBeDefined();
    expect(keptThread).toBeDefined();

    const messagesIn = async (conversationId: string) => {
      const rows = await db
        .select({ id: schema.whatsappMessage.id })
        .from(schema.whatsappMessage)
        .where(eq(schema.whatsappMessage.conversationId, conversationId));
      return rows.length;
    };
    expect(await messagesIn(doomedThread!)).toBeGreaterThan(0);

    expect(await studentsDal.hardDeleteStudent(ctx, doomedId)).toBe(true);

    // The thread goes with the aluno — it must NOT survive as an orphan with a
    // null studentId, which is what the old `set null` rule produced.
    expect(await threadOf(doomedId)).toBeUndefined();
    const [orphan] = await db
      .select({ id: schema.whatsappConversation.id })
      .from(schema.whatsappConversation)
      .where(eq(schema.whatsappConversation.id, doomedThread!));
    expect(orphan).toBeUndefined();

    // And the messages go with the thread, not just the link to it — they are
    // the personal data the deletion was supposed to remove.
    expect(await messagesIn(doomedThread!)).toBe(0);

    // The other aluno's thread is untouched.
    expect(await threadOf(keptId)).toBe(keptThread);
    expect(await messagesIn(keptThread!)).toBeGreaterThan(0);
  });

  it("leaves an unlinked thread alone — a never-a-student number is not an orphan", async () => {
    const ctx = await ownerContext("wa-delete-2@example.com", "clinica");
    const studentId = await addStudent(ctx, "11999990003", "Cau", "Aluno");

    // An inbound from a number that belongs to nobody. This is exactly why
    // migration 0035 does not backfill-delete NULL-student conversations: this
    // row is indistinguishable from one orphaned by an old deletion.
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11988887777",
      body: "Oi, queria saber dos planos",
    });
    await whatsapp.ingestInboundMessage(ctx, {
      from: "11999990003",
      body: "Oi",
    });

    expect(await studentsDal.hardDeleteStudent(ctx, studentId)).toBe(true);

    const rows = await db
      .select({ phone: schema.whatsappConversation.phone })
      .from(schema.whatsappConversation)
      .where(eq(schema.whatsappConversation.clinicId, ctx.clinicId));
    expect(rows.map((r) => r.phone)).toEqual([normalizePhone("11988887777")]);
  });
});
