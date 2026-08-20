// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { billing } from "@/server/dal";
import type { InvoiceWriteInput } from "@/lib/billing";
import type { TenantContext } from "@/server/tenant";

import { createTestDb, type TestDb } from "./pglite";

process.env.BETTER_AUTH_SECRET ||= "integration-test-secret-0123456789abcdef";

let auth: ReturnType<typeof createAuth>;
let db: TestDb;
let h: DB;

const password = "supersegura123";

/** Signs up a coach (which bootstraps their clinic) and returns both ids. */
async function coachClinic(
  email: string,
  name: string,
): Promise<{ userId: string; clinicId: string }> {
  await auth.api.signUpEmail({ body: { name, email, password } });
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email));
  return { userId: user.id, clinicId: user.clinicId! };
}

/** A minimal, valid invoice write payload with one line item. */
function invoiceInput(overrides: Partial<InvoiceWriteInput> = {}): InvoiceWriteInput {
  return {
    competencia: "2026-03-01",
    issuedAt: "2026-03-01",
    dueDate: "2999-01-01",
    planSnapshot: "solo",
    discountCents: 0,
    discountReason: null,
    notes: null,
    lineItems: [{ description: "Mensalidade", amountCents: 19900 }],
    ...overrides,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  h = db as unknown as DB;
  auth = createAuth({ db, nextCookiesPlugin: false, sendOtp: async () => {} });
});

describe("manual billing — plan switch + audit trail", () => {
  it("changes the clinic plan and logs the from→to change", async () => {
    const c = await coachClinic("plan-a@example.com", "Plan A");

    const res = await billing.setClinicPlan(h, c.clinicId, "clinica", c.userId, "upgrade");
    expect(res).toMatchObject({ ok: true, fromPlan: "free", toPlan: "clinica", changed: true });

    // The plan column is updated live — features read it directly.
    const [row] = await db
      .select({ plan: schema.clinic.plan })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, c.clinicId));
    expect(row.plan).toBe("clinica");

    const history = await billing.listPlanChanges(h, c.clinicId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromPlan: "free",
      toPlan: "clinica",
      note: "upgrade",
      changedByName: "Plan A",
    });
  });

  it("is a no-op (no log) when the plan does not change", async () => {
    const c = await coachClinic("plan-b@example.com", "Plan B");
    const res = await billing.setClinicPlan(h, c.clinicId, "free", c.userId, null);
    expect(res).toMatchObject({ ok: true, changed: false });
    expect(await billing.listPlanChanges(h, c.clinicId)).toHaveLength(0);
  });

  it("returns ok:false for an unknown clinic", async () => {
    const res = await billing.setClinicPlan(
      h,
      "00000000-0000-0000-0000-000000000000",
      "solo",
      "00000000-0000-0000-0000-000000000000",
      null,
    );
    expect(res).toEqual({ ok: false });
  });
});

describe("manual billing — invoices", () => {
  it("assigns sequential numbers and derives the total from line items − discount", async () => {
    const c = await coachClinic("inv-a@example.com", "Inv A");

    const first = await billing.createInvoice(
      h,
      c.clinicId,
      invoiceInput({
        lineItems: [
          { description: "Mensalidade", amountCents: 19900 },
          { description: "Taxa", amountCents: 5000 },
        ],
        discountCents: 4900,
      }),
      c.userId,
    );
    expect(first).not.toBeNull();
    expect(first!.subtotalCents).toBe(24900);
    expect(first!.totalCents).toBe(20000); // 24900 − 4900
    expect(first!.lineItems).toHaveLength(2);

    const second = await billing.createInvoice(h, c.clinicId, invoiceInput(), c.userId);
    // Numbers are sequential and platform-wide.
    expect(second!.number).toBe(first!.number + 1);
  });

  it("flags a pending invoice past its due date as overdue", async () => {
    const c = await coachClinic("inv-overdue@example.com", "Inv Overdue");
    const overdue = await billing.createInvoice(
      h,
      c.clinicId,
      invoiceInput({ dueDate: "2020-01-01" }),
      c.userId,
    );
    expect(overdue!.overdue).toBe(true);
    expect(overdue!.status).toBe("pending");
  });

  it("updates editable fields + replaces line items", async () => {
    const c = await coachClinic("inv-edit@example.com", "Inv Edit");
    const inv = await billing.createInvoice(h, c.clinicId, invoiceInput(), c.userId);

    const updated = await billing.updateInvoice(
      h,
      inv!.id,
      invoiceInput({
        lineItems: [{ description: "Novo item", amountCents: 30000 }],
        discountCents: 1000,
      }),
    );
    expect(updated!.number).toBe(inv!.number); // number is preserved
    expect(updated!.lineItems).toHaveLength(1);
    expect(updated!.lineItems[0].description).toBe("Novo item");
    expect(updated!.totalCents).toBe(29000);
  });

  it("marks paid (date + method) and cancels — both keep it in the ledger", async () => {
    const c = await coachClinic("inv-paid@example.com", "Inv Paid");

    const toPay = await billing.createInvoice(h, c.clinicId, invoiceInput(), c.userId);
    const paid = await billing.markInvoicePaid(h, toPay!.id, {
      paidAt: "2026-03-10",
      paymentMethod: "pix",
    });
    expect(paid!.status).toBe("paid");
    expect(paid!.paidAt).toBe("2026-03-10");
    expect(paid!.paymentMethod).toBe("pix");
    expect(paid!.overdue).toBe(false); // paid is never overdue

    const toCancel = await billing.createInvoice(h, c.clinicId, invoiceInput(), c.userId);
    const canceled = await billing.cancelInvoice(h, toCancel!.id);
    expect(canceled!.status).toBe("canceled");
    // Still present in the ledger.
    expect(await billing.getInvoice(h, toCancel!.id)).not.toBeNull();
  });

  it("granting: marking paid moves the clinic onto the plan it billed", async () => {
    const c = await coachClinic("inv-grant@example.com", "Inv Grant");
    // The clinic is on `free`; the fatura bills Solo.
    const inv = await billing.createInvoice(
      h,
      c.clinicId,
      invoiceInput({ planSnapshot: "solo" }),
      c.userId,
    );

    await billing.markInvoicePaid(
      h,
      inv!.id,
      { paidAt: "2026-03-10", paymentMethod: "pix" },
      c.userId,
    );

    // The bug this replaces: the fatura read "Paga" while the clinic sat on
    // Free until somebody remembered a second, unrelated admin click.
    const [clinic] = await db
      .select({ plan: schema.clinic.plan })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, c.clinicId));
    expect(clinic.plan).toBe("solo");

    // And it is auditable like any other plan change.
    const history = await billing.listPlanChanges(h, c.clinicId);
    expect(history[0]).toMatchObject({ fromPlan: "free", toPlan: "solo" });
  });

  it("granting: settling a renewal changes nothing and writes no audit row", async () => {
    const c = await coachClinic("inv-renew@example.com", "Inv Renew");
    await billing.setClinicPlan(h, c.clinicId, "solo", c.userId, "upgrade");
    const before = (await billing.listPlanChanges(h, c.clinicId)).length;

    const inv = await billing.createInvoice(
      h,
      c.clinicId,
      invoiceInput({ planSnapshot: "solo" }),
      c.userId,
    );
    await billing.markInvoicePaid(
      h,
      inv!.id,
      { paidAt: "2026-04-10", paymentMethod: "pix" },
      c.userId,
    );

    // Every month of a subscription settles an invoice for the plan the clinic
    // is already on; each one writing an audit row would bury the real changes.
    expect(await billing.listPlanChanges(h, c.clinicId)).toHaveLength(before);
  });

  it("granting: without an admin id it is a ledger action only", async () => {
    const c = await coachClinic("inv-noadmin@example.com", "Inv NoAdmin");
    const inv = await billing.createInvoice(
      h,
      c.clinicId,
      invoiceInput({ planSnapshot: "clinica" }),
      c.userId,
    );

    // `clinic_plan_change.changed_by` needs an author, so a caller with no
    // session settles the ledger and leaves the plan alone rather than
    // inventing one.
    const paid = await billing.markInvoicePaid(h, inv!.id, {
      paidAt: "2026-03-10",
      paymentMethod: "pix",
    });
    expect(paid!.status).toBe("paid");

    const [clinic] = await db
      .select({ plan: schema.clinic.plan })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, c.clinicId));
    expect(clinic.plan).toBe("free");
  });

  it("deletes an invoice (line items cascade)", async () => {
    const c = await coachClinic("inv-del@example.com", "Inv Del");
    const inv = await billing.createInvoice(h, c.clinicId, invoiceInput(), c.userId);

    expect(await billing.deleteInvoice(h, inv!.id)).toBe(true);
    expect(await billing.getInvoice(h, inv!.id)).toBeNull();
    // Its line items are gone too.
    expect(
      await db
        .select()
        .from(schema.invoiceLineItem)
        .where(eq(schema.invoiceLineItem.invoiceId, inv!.id)),
    ).toHaveLength(0);
  });

  it("does not create an invoice for an unknown clinic", async () => {
    const inv = await billing.createInvoice(
      h,
      "00000000-0000-0000-0000-000000000000",
      invoiceInput(),
      "00000000-0000-0000-0000-000000000000",
    );
    expect(inv).toBeNull();
  });
});

describe("manual billing — coach read is tenant-scoped", () => {
  it("lists only the coach's own clinic invoices, never another clinic's", async () => {
    const a = await coachClinic("scope-a@example.com", "Scope A");
    const b = await coachClinic("scope-b@example.com", "Scope B");

    await billing.createInvoice(h, a.clinicId, invoiceInput(), a.userId);
    await billing.createInvoice(h, b.clinicId, invoiceInput(), b.userId);

    const ctxA: TenantContext = {
      db: h,
      clinicId: a.clinicId,
      userId: a.userId,
      role: "coach",
    };
    const mine = await billing.listMyInvoices(ctxA);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((inv) => inv.clinicId === a.clinicId)).toBe(true);
  });
});

/**
 * Coach-initiated subscription ("Assinar", roadmap item 0 Phase 1). The safety
 * properties matter more than the happy path: a coach can trigger this, so the
 * price must be server-derived, it must not stack faturas, and it must not
 * grant the plan by itself.
 */
describe("requestSubscription (coach-initiated)", () => {
  let ctx: TenantContext;

  beforeAll(async () => {
    const { userId, clinicId } = await coachClinic(
      "assinar@example.com",
      "Coach Assinar",
    );
    ctx = { db: h, clinicId, userId, role: "coach" };
  });

  it("raises a pending fatura priced from the server, not the caller", async () => {
    const result = await billing.requestSubscription(ctx, "solo");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.created).toBe(true);
    expect(result.invoice.status).toBe("pending");
    // PLAN_PRICE_CENTS.solo — the client only ever names a plan.
    expect(result.invoice.totalCents).toBe(17900);
    expect(result.invoice.planSnapshot).toBe("solo");
  });

  it("reuses the open fatura instead of stacking a second one", async () => {
    const again = await billing.requestSubscription(ctx, "clinica");
    expect("error" in again).toBe(false);
    if ("error" in again) return;

    // Opening the panel repeatedly must never multiply what the coach owes.
    expect(again.created).toBe(false);
    const invoices = await billing.listMyInvoices(ctx);
    expect(invoices.filter((i) => i.status === "pending")).toHaveLength(1);
  });

  it("does NOT grant the plan — an admin still confirms the money", async () => {
    const [clinic] = await db
      .select()
      .from(schema.clinic)
      .where(eq(schema.clinic.id, ctx.clinicId));
    expect(clinic.plan).toBe("free");
  });

  it("refuses Enterprise, which has no self-serve price", async () => {
    const { userId, clinicId } = await coachClinic(
      "enterprise@example.com",
      "Coach Ent",
    );
    const other: TenantContext = { db: h, clinicId, userId, role: "coach" };
    const result = await billing.requestSubscription(other, "enterprise");
    expect(result).toEqual({ error: "unpriced" });
  });

  it("scopes the fatura to the requesting clinic only", async () => {
    const { userId, clinicId } = await coachClinic("other@example.com", "Outro");
    const other: TenantContext = { db: h, clinicId, userId, role: "coach" };
    const result = await billing.requestSubscription(other, "solo");
    expect("error" in result).toBe(false);

    const mine = await billing.listMyInvoices(other);
    expect(mine.every((i) => i.clinicId === clinicId)).toBe(true);
    expect(mine).toHaveLength(1);
  });
});
