// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { addDays } from "@/lib/calendar";
import { normalizePhone } from "@/lib/phone";
import type { InvoiceWriteInput } from "@/lib/billing";
import { billing } from "@/server/dal";
import { runInvoiceReminders } from "@/server/billing-reminders";
import type { TenantContext } from "@/server/tenant";

import { clearTrial, createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";
const appUrl = "https://app.progresso.test";
const today = "2026-09-10";

/** Signs up a coach (bootstraps their clinic), drops the trial, sets the plan. */
async function ownerContext(
  email: string,
  plan: schema.Plan,
  whatsapp: string | null = null,
): Promise<TenantContext> {
  await auth.api.signUpEmail({ body: { name: "Coach Owner", email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  await db
    .update(schema.clinic)
    .set({ plan, whatsapp })
    .where(eq(schema.clinic.id, user.clinicId!));
  // These tests assert PLAN gates, so drop the sign-up trial — otherwise a
  // free clinic reads as Solo (WhatsApp-capable) while it runs.
  await clearTrial(db, user.clinicId!);
  return { db: h, clinicId: user.clinicId!, userId: user.id, role: "coach" };
}

/** Inserts a base (app-wide, `clinicId = null`) approved template. */
async function addBaseTemplate(key: string, title: string, body: string) {
  await db
    .insert(schema.whatsappTemplate)
    .values({ clinicId: null, key, title, body, status: "approved" })
    .onConflictDoNothing();
}

function invoiceInput(overrides: Partial<InvoiceWriteInput> = {}): InvoiceWriteInput {
  return {
    competencia: "2026-09-01",
    issuedAt: "2026-09-01",
    dueDate: today,
    planSnapshot: "solo",
    discountCents: 0,
    discountReason: null,
    notes: null,
    lineItems: [{ description: "Mensalidade", amountCents: 17900 }],
    ...overrides,
  };
}

async function reminderRows(invoiceId: string) {
  return db
    .select()
    .from(schema.invoiceReminder)
    .where(eq(schema.invoiceReminder.invoiceId, invoiceId));
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
  await addBaseTemplate(
    "invoice_due",
    "Fatura a vencer",
    "Oi {nome}! Sua fatura {periodo}. {link}",
  );
});

describe("runInvoiceReminders — channel selection", () => {
  it("messages a Solo+ clinic with a saved number over WhatsApp, D-3", async () => {
    const ctx = await ownerContext(
      "inv-wa@example.com",
      "solo",
      "+55 11 98888-0001",
    );
    const invoice = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: addDays(today, 3) }),
      ctx.userId,
    );

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await runInvoiceReminders(appUrl, h, today);
    const loggedTemplate = infoSpy.mock.calls
      .map((c) => c.map(String).join(" "))
      .find((line) => line.includes("invoice_due"));
    infoSpy.mockRestore();

    expect(result).toMatchObject({ invoicesProcessed: 1, whatsappSent: 1, emailSent: 0 });
    const rows = await reminderRows(invoice!.id);
    expect(rows).toMatchObject([{ reminderDate: today, channel: "whatsapp" }]);

    expect(loggedTemplate).toContain("vence em 3 dias");
  });

  it("falls back to e-mail for a Free clinic", async () => {
    const ctx = await ownerContext("inv-free@example.com", "free");
    const invoice = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: today }),
      ctx.userId,
    );

    const result = await runInvoiceReminders(appUrl, h, today);

    expect(result.emailSent).toBeGreaterThanOrEqual(1);
    const rows = await reminderRows(invoice!.id);
    expect(rows).toMatchObject([{ reminderDate: today, channel: "email" }]);
  });

  it("falls back to e-mail for a paid clinic with no saved WhatsApp number", async () => {
    const ctx = await ownerContext("inv-nophone@example.com", "clinica", null);
    const invoice = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: addDays(today, 3) }),
      ctx.userId,
    );

    const result = await runInvoiceReminders(appUrl, h, today);

    expect(result.whatsappSent).toBe(0);
    const rows = await reminderRows(invoice!.id);
    expect(rows).toMatchObject([{ reminderDate: today, channel: "email" }]);
  });
});

describe("runInvoiceReminders — window + idempotency + scoping", () => {
  it("does not re-send a reminder already recorded for that invoice today", async () => {
    const ctx = await ownerContext(
      "inv-dupe@example.com",
      "solo",
      normalizePhone("11988880002")!,
    );
    const invoice = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: today }),
      ctx.userId,
    );

    const first = await runInvoiceReminders(appUrl, h, today);
    expect(first.invoicesProcessed).toBeGreaterThanOrEqual(1);

    const second = await runInvoiceReminders(appUrl, h, today);
    expect(second.invoicesProcessed).toBe(0);

    const rows = await reminderRows(invoice!.id);
    expect(rows).toHaveLength(1);
  });

  it("reminds every invoice inside the window on the same run, regardless of exact day", async () => {
    const ctx = await ownerContext(
      "inv-window@example.com",
      "solo",
      normalizePhone("11988880003")!,
    );
    const dueSoon = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: addDays(today, 3), competencia: "2026-09-01" }),
      ctx.userId,
    );
    const dueTomorrow = await billing.createInvoice(
      h,
      ctx.clinicId,
      // Neither exactly D-3 nor exactly the due date — the old fixed-step
      // model would have skipped this one entirely.
      invoiceInput({ dueDate: addDays(today, 1), competencia: "2026-08-01" }),
      ctx.userId,
    );
    const dueToday = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: today, competencia: "2026-07-01" }),
      ctx.userId,
    );

    const result = await runInvoiceReminders(appUrl, h, today);
    expect(result.invoicesProcessed).toBe(3);

    expect(await reminderRows(dueSoon!.id)).toMatchObject([{ reminderDate: today }]);
    expect(await reminderRows(dueTomorrow!.id)).toMatchObject([{ reminderDate: today }]);
    expect(await reminderRows(dueToday!.id)).toMatchObject([{ reminderDate: today }]);
  });

  it("keeps reminding an overdue invoice every day until it's paid", async () => {
    const ctx = await ownerContext(
      "inv-overdue@example.com",
      "solo",
      normalizePhone("11988880005")!,
    );
    const invoice = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: addDays(today, -10) }),
      ctx.userId,
    );

    const day1 = await runInvoiceReminders(appUrl, h, today);
    expect(day1.invoicesProcessed).toBeGreaterThanOrEqual(1);
    expect(await reminderRows(invoice!.id)).toMatchObject([{ reminderDate: today }]);

    // A later run (a fresh calendar day) is a fresh idempotency window — this
    // still-unpaid invoice is eligible again, unlike the old fixed-step model
    // where a missed day meant a missed reminder for good.
    const tomorrow = addDays(today, 1);
    const day2 = await runInvoiceReminders(appUrl, h, tomorrow);
    expect(day2.invoicesProcessed).toBeGreaterThanOrEqual(1);

    const rows = await reminderRows(invoice!.id);
    expect(rows.map((r) => r.reminderDate).sort()).toEqual([today, tomorrow].sort());
  });

  it("never reminds a paid or canceled invoice", async () => {
    const ctx = await ownerContext(
      "inv-paid@example.com",
      "solo",
      normalizePhone("11988880004")!,
    );
    const paid = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: addDays(today, 3) }),
      ctx.userId,
    );
    await billing.markInvoicePaid(h, paid!.id, { paidAt: today, paymentMethod: "pix" });

    const canceled = await billing.createInvoice(
      h,
      ctx.clinicId,
      invoiceInput({ dueDate: today }),
      ctx.userId,
    );
    await billing.cancelInvoice(h, canceled!.id);

    const result = await runInvoiceReminders(appUrl, h, today);
    expect(result.invoicesProcessed).toBe(0);
    expect(await reminderRows(paid!.id)).toHaveLength(0);
    expect(await reminderRows(canceled!.id)).toHaveLength(0);
  });
});
