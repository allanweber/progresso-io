import { describe, expect, it } from "vitest";

import {
  centsToReais,
  formatBRL,
  formatCompetencia,
  formatDateBR,
  invoiceTotals,
  invoiceWriteSchema,
  isOverdue,
  markPaidSchema,
  planChangeSchema,
  PLAN_PRICE_CENTS,
  reaisToCents,
} from "@/lib/billing";

/**
 * Unit tests for the client-safe billing domain: money/date formatting, the
 * derived totals + overdue rule, the reais↔cents input helpers, and the zod
 * schemas the admin API validates. No DB.
 */

describe("money + date helpers", () => {
  it("formats BRL cents", () => {
    expect(formatBRL(19900)).toBe("R$ 199,00");
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("formats a competência as Month/Year and dates as DD/MM/YYYY", () => {
    expect(formatCompetencia("2026-03-01")).toBe("Março/2026");
    expect(formatDateBR("2026-03-09")).toBe("09/03/2026");
    expect(formatDateBR(null)).toBe("—");
  });

  it("round-trips reais input ↔ cents", () => {
    expect(reaisToCents("199.90")).toBe(19990);
    expect(reaisToCents("199.9")).toBe(19990);
    expect(reaisToCents("")).toBe(0);
    expect(reaisToCents("-5")).toBe(0);
    expect(reaisToCents("abc")).toBe(0);
    expect(centsToReais(19990)).toBe("199.90");
  });
});

describe("derived totals + overdue", () => {
  it("subtotals the line items and floors the total at 0 after discount", () => {
    expect(invoiceTotals([{ amountCents: 10000 }, { amountCents: 5000 }], 3000)).toEqual({
      subtotalCents: 15000,
      totalCents: 12000,
    });
    // A discount larger than the subtotal never goes negative.
    expect(invoiceTotals([{ amountCents: 1000 }], 5000)).toEqual({
      subtotalCents: 1000,
      totalCents: 0,
    });
  });

  it("only flags a pending invoice past its due date", () => {
    expect(isOverdue("pending", "2020-01-01", "2026-08-12")).toBe(true);
    expect(isOverdue("pending", "2999-01-01", "2026-08-12")).toBe(false);
    expect(isOverdue("paid", "2020-01-01", "2026-08-12")).toBe(false);
    expect(isOverdue("canceled", "2020-01-01", "2026-08-12")).toBe(false);
  });

  it("exposes a price per plan (null = sob consulta)", () => {
    expect(PLAN_PRICE_CENTS.solo).toBe(19900);
    expect(PLAN_PRICE_CENTS.free).toBe(0);
    expect(PLAN_PRICE_CENTS.enterprise).toBeNull();
  });
});

describe("zod schemas", () => {
  const validInvoice = {
    competencia: "2026-03-01",
    issuedAt: "2026-03-01",
    dueDate: "2026-03-10",
    planSnapshot: "solo",
    lineItems: [{ description: "Mensalidade", amountCents: 19900 }],
  };

  it("accepts a valid invoice and defaults the discount to 0", () => {
    const parsed = invoiceWriteSchema.parse(validInvoice);
    expect(parsed.discountCents).toBe(0);
    expect(parsed.lineItems).toHaveLength(1);
  });

  it("rejects an invoice with no line items or a bad date", () => {
    expect(invoiceWriteSchema.safeParse({ ...validInvoice, lineItems: [] }).success).toBe(
      false,
    );
    expect(
      invoiceWriteSchema.safeParse({ ...validInvoice, competencia: "03/2026" }).success,
    ).toBe(false);
  });

  it("rejects a negative discount and an unknown plan", () => {
    expect(
      invoiceWriteSchema.safeParse({ ...validInvoice, discountCents: -1 }).success,
    ).toBe(false);
    expect(
      invoiceWriteSchema.safeParse({ ...validInvoice, planSnapshot: "gold" }).success,
    ).toBe(false);
  });

  it("validates mark-paid and plan-change payloads", () => {
    expect(markPaidSchema.safeParse({ paidAt: "2026-03-10", paymentMethod: "pix" }).success).toBe(
      true,
    );
    expect(
      markPaidSchema.safeParse({ paidAt: "2026-03-10", paymentMethod: "bitcoin" }).success,
    ).toBe(false);
    expect(planChangeSchema.safeParse({ plan: "clinica", note: "upgrade" }).success).toBe(true);
    expect(planChangeSchema.safeParse({ plan: "clinica" }).success).toBe(true);
    expect(planChangeSchema.safeParse({ plan: "invalid" }).success).toBe(false);
  });
});
