import type { InvoiceStatus, PaymentMethod, Plan } from "@/db/schema";
import { z } from "@/lib/validation";

// Pure formatters live in a zod-free module so client components can import
// them without pulling zod in; re-exported here for existing callers.
export { formatBRL, formatDateBR } from "@/lib/format";

/**
 * Client-safe billing domain: enum values + PT-BR labels, money/date helpers,
 * the zod schemas the admin billing API validates, and the DTOs the admin +
 * coach screens read. Only erased `import type`s from the schema, so it bundles
 * into client code. Money is BRL **cents** (integers) everywhere; the invoice
 * total is derived (`sum(line items) − discount`), never trusted from the client.
 */

/* -------------------------------------------------------------------------- */
/*  Enums + labels (mirrored client-side, checked against the schema types)     */
/* -------------------------------------------------------------------------- */

export const PLAN_VALUES = [
  "free",
  "solo",
  "clinica",
  "enterprise",
] as const satisfies readonly Plan[];

export const INVOICE_STATUS_VALUES = [
  "pending",
  "paid",
  "canceled",
] as const satisfies readonly InvoiceStatus[];

export const PAYMENT_METHOD_VALUES = [
  "pix",
  "boleto",
  "cartao",
  "transferencia",
  "outro",
] as const satisfies readonly PaymentMethod[];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pendente",
  paid: "Paga",
  canceled: "Cancelada",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  transferencia: "Transferência",
  outro: "Outro",
};

/** Monthly plan price in BRL cents (null = "sob consulta", no prefill). */
export const PLAN_PRICE_CENTS: Record<Plan, number | null> = {
  free: 0,
  solo: 17900,
  clinica: 37900,
  enterprise: null,
};

/* -------------------------------------------------------------------------- */
/*  Money + date helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Formats BRL cents as "R$ 1.234,56". */


const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-03-01" → "Março/2026". */
export function formatCompetencia(iso: string): string {
  const [y, m] = iso.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? m}/${y}`;
}

/** "2026-03-09" → "09/03/2026" (or "—" when null). */


/** Subtotal + total (BRL cents). Total floors at 0 after the discount. */
export function invoiceTotals(
  lineItems: { amountCents: number }[],
  discountCents: number,
): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lineItems.reduce((s, i) => s + i.amountCents, 0);
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return { subtotalCents, totalCents };
}

/**
 * A money `<input type="number" step="0.01">` value (reais, dot-decimal) → BRL
 * cents. Blank / non-finite / negative → 0. Rounds to the nearest cent so
 * "199.9" → 19990.
 */
export function reaisToCents(input: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

/** BRL cents → a plain "199.90" string to prefill a money input (no separators). */
export function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Overdue = a still-pending invoice whose due date is before `todayIso`. */
export function isOverdue(
  status: InvoiceStatus,
  dueDate: string,
  todayIso: string,
): boolean {
  return status === "pending" && dueDate < todayIso;
}

/* -------------------------------------------------------------------------- */
/*  DTOs                                                                        */
/* -------------------------------------------------------------------------- */

export type InvoiceLineItemDto = {
  id: string;
  description: string;
  amountCents: number;
};

export type InvoiceDto = {
  id: string;
  number: number;
  clinicId: string;
  status: InvoiceStatus;
  /** Derived: a pending invoice past its due date. */
  overdue: boolean;
  competencia: string;
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  discountCents: number;
  discountReason: string | null;
  planSnapshot: Plan;
  notes: string | null;
  lineItems: InvoiceLineItemDto[];
  subtotalCents: number;
  totalCents: number;
  createdAt: string;
};

export type PlanChangeDto = {
  id: string;
  fromPlan: Plan | null;
  toPlan: Plan;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");

export const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1, "Descreva o item.").max(200),
  amountCents: z.number().int("Valor inválido.").min(0, "Valor inválido."),
});

/** Create/edit an invoice. `clinicId` comes from the route, never the body. */
export const invoiceWriteSchema = z.object({
  competencia: dateStr,
  issuedAt: dateStr,
  dueDate: dateStr,
  planSnapshot: z.enum(PLAN_VALUES),
  discountCents: z.number().int().min(0, "Desconto inválido.").default(0),
  discountReason: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(1000).nullish(),
  lineItems: z
    .array(invoiceLineItemSchema)
    .min(1, "Adicione ao menos um item.")
    .max(50),
});
export type InvoiceWriteInput = z.output<typeof invoiceWriteSchema>;

export const markPaidSchema = z.object({
  paidAt: dateStr,
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
});
export type MarkPaidInput = z.output<typeof markPaidSchema>;

export const planChangeSchema = z.object({
  plan: z.enum(PLAN_VALUES),
  note: z.string().trim().max(300).nullish(),
});
export type PlanChangeInput = z.output<typeof planChangeSchema>;
