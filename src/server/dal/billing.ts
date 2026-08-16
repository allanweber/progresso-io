import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { type DB, schema } from "@/db";
import type { Invoice, InvoiceLineItem, Plan } from "@/db/schema";
import {
  invoiceTotals,
  isOverdue,
  PLAN_PRICE_CENTS,
  type InvoiceDto,
  type InvoiceLineItemDto,
  type InvoiceWriteInput,
  type MarkPaidInput,
  type PlanChangeDto,
} from "@/lib/billing";
import { PLAN_META } from "@/lib/plans";
import type { TenantContext } from "@/server/tenant";

/**
 * Manual-billing DAL. Platform admins manage clinic plans + invoices by hand
 * (there is no gateway). The admin functions take a raw {@link DB} and are NOT
 * tenant-scoped — gated by `getAdminSession()` at the route — while the coach's
 * read of its own invoices takes a {@link TenantContext} and is scoped to
 * `ctx.clinicId`. Money is BRL cents; the invoice total is always recomputed
 * from the line items, never stored.
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Serializes an invoice row + its items into the DTO (with derived totals). */
function toDto(
  r: Invoice,
  lineItems: InvoiceLineItemDto[],
  today: string,
): InvoiceDto {
  const { subtotalCents, totalCents } = invoiceTotals(lineItems, r.discountCents);
  return {
    id: r.id,
    number: r.number,
    clinicId: r.clinicId,
    status: r.status,
    overdue: isOverdue(r.status, r.dueDate, today),
    competencia: r.competencia,
    issuedAt: r.issuedAt,
    dueDate: r.dueDate,
    paidAt: r.paidAt,
    paymentMethod: r.paymentMethod,
    discountCents: r.discountCents,
    discountReason: r.discountReason,
    planSnapshot: r.planSnapshot,
    notes: r.notes,
    lineItems,
    subtotalCents,
    totalCents,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Loads invoices matching `where` (any DB/tenant) with their line items. */
async function loadInvoices(
  db: DB,
  where: ReturnType<typeof eq>,
): Promise<InvoiceDto[]> {
  const rows = await db
    .select()
    .from(schema.invoice)
    .where(where)
    .orderBy(desc(schema.invoice.number));
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(schema.invoiceLineItem)
    .where(
      inArray(
        schema.invoiceLineItem.invoiceId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(schema.invoiceLineItem.position), asc(schema.invoiceLineItem.id));

  const byInvoice = new Map<string, InvoiceLineItemDto[]>();
  for (const it of items as InvoiceLineItem[]) {
    const list = byInvoice.get(it.invoiceId) ?? [];
    list.push({ id: it.id, description: it.description, amountCents: it.amountCents });
    byInvoice.set(it.invoiceId, list);
  }

  const today = todayIso();
  return rows.map((r) => toDto(r, byInvoice.get(r.id) ?? [], today));
}

/* -------------------------------------------------------------------------- */
/*  Plan (functional switch) + audit trail                                     */
/* -------------------------------------------------------------------------- */

export type SetPlanResult =
  | { ok: true; fromPlan: Plan; toPlan: Plan; changed: boolean }
  | { ok: false };

/**
 * Sets a clinic's plan (admin). Logs a `clinic_plan_change` row when the plan
 * actually changes. Runs in one transaction with the clinic row locked so the
 * from→to record can't race. Changing the plan instantly re-gates the clinic's
 * features (student cap, branded portal) — those read `clinic.plan` live.
 */
export async function setClinicPlan(
  db: DB,
  clinicId: string,
  toPlan: Plan,
  changedBy: string,
  note: string | null,
): Promise<SetPlanResult> {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ plan: schema.clinic.plan })
      .from(schema.clinic)
      .where(eq(schema.clinic.id, clinicId))
      .for("update");
    if (!c) return { ok: false };
    const fromPlan = c.plan;
    if (fromPlan === toPlan) return { ok: true, fromPlan, toPlan, changed: false };

    await tx
      .update(schema.clinic)
      .set({ plan: toPlan, updatedAt: new Date() })
      .where(eq(schema.clinic.id, clinicId));
    await tx
      .insert(schema.clinicPlanChange)
      .values({ clinicId, fromPlan, toPlan, changedBy, note });
    return { ok: true, fromPlan, toPlan, changed: true };
  });
}

/** A clinic's plan-change history (newest first), with the admin's name. */
export async function listPlanChanges(
  db: DB,
  clinicId: string,
): Promise<PlanChangeDto[]> {
  const rows = await db
    .select({
      id: schema.clinicPlanChange.id,
      fromPlan: schema.clinicPlanChange.fromPlan,
      toPlan: schema.clinicPlanChange.toPlan,
      note: schema.clinicPlanChange.note,
      createdAt: schema.clinicPlanChange.createdAt,
      changedByName: schema.user.name,
    })
    .from(schema.clinicPlanChange)
    .leftJoin(schema.user, eq(schema.user.id, schema.clinicPlanChange.changedBy))
    .where(eq(schema.clinicPlanChange.clinicId, clinicId))
    .orderBy(desc(schema.clinicPlanChange.createdAt));

  return rows.map((r) => ({
    id: r.id,
    fromPlan: r.fromPlan,
    toPlan: r.toPlan,
    changedByName: r.changedByName,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Invoices (admin CRUD)                                                       */
/* -------------------------------------------------------------------------- */

/** One invoice by id (with line items), or null. */
export async function getInvoice(
  db: DB,
  invoiceId: string,
): Promise<InvoiceDto | null> {
  const [dto] = await loadInvoices(db, eq(schema.invoice.id, invoiceId));
  return dto ?? null;
}

/** Every invoice for a clinic (admin), newest number first. */
export async function listInvoicesForClinic(
  db: DB,
  clinicId: string,
): Promise<InvoiceDto[]> {
  return loadInvoices(db, eq(schema.invoice.clinicId, clinicId));
}

/**
 * Creates an invoice with its line items (admin). Assigns the next
 * platform-wide `number`. Returns null when the clinic doesn't exist.
 */
export async function createInvoice(
  db: DB,
  clinicId: string,
  input: InvoiceWriteInput,
  createdBy: string,
): Promise<InvoiceDto | null> {
  const [c] = await db
    .select({ id: schema.clinic.id })
    .from(schema.clinic)
    .where(eq(schema.clinic.id, clinicId));
  if (!c) return null;

  const id = await db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${schema.invoice.number}), 0)` })
      .from(schema.invoice);
    const [row] = await tx
      .insert(schema.invoice)
      .values({
        clinicId,
        number: max + 1,
        competencia: input.competencia,
        issuedAt: input.issuedAt,
        dueDate: input.dueDate,
        planSnapshot: input.planSnapshot,
        discountCents: input.discountCents,
        discountReason: input.discountReason ?? null,
        notes: input.notes ?? null,
        createdBy,
      })
      .returning({ id: schema.invoice.id });
    await tx.insert(schema.invoiceLineItem).values(
      input.lineItems.map((li, i) => ({
        invoiceId: row.id,
        description: li.description,
        amountCents: li.amountCents,
        position: i,
      })),
    );
    return row.id;
  });

  return getInvoice(db, id);
}

/** Replaces an invoice's editable fields + line items (admin). Null if unknown. */
export async function updateInvoice(
  db: DB,
  invoiceId: string,
  input: InvoiceWriteInput,
): Promise<InvoiceDto | null> {
  const ok = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.invoice)
      .set({
        competencia: input.competencia,
        issuedAt: input.issuedAt,
        dueDate: input.dueDate,
        planSnapshot: input.planSnapshot,
        discountCents: input.discountCents,
        discountReason: input.discountReason ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.invoice.id, invoiceId))
      .returning({ id: schema.invoice.id });
    if (!row) return false;

    await tx
      .delete(schema.invoiceLineItem)
      .where(eq(schema.invoiceLineItem.invoiceId, invoiceId));
    await tx.insert(schema.invoiceLineItem).values(
      input.lineItems.map((li, i) => ({
        invoiceId,
        description: li.description,
        amountCents: li.amountCents,
        position: i,
      })),
    );
    return true;
  });

  return ok ? getInvoice(db, invoiceId) : null;
}

/** Marks an invoice paid (records the date + method). Null when unknown. */
export async function markInvoicePaid(
  db: DB,
  invoiceId: string,
  input: MarkPaidInput,
): Promise<InvoiceDto | null> {
  const [row] = await db
    .update(schema.invoice)
    .set({
      status: "paid",
      paidAt: input.paidAt,
      paymentMethod: input.paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(schema.invoice.id, invoiceId))
    .returning({ id: schema.invoice.id });
  return row ? getInvoice(db, invoiceId) : null;
}

/** Cancels an invoice (keeps it in the ledger). Null when unknown. */
export async function cancelInvoice(
  db: DB,
  invoiceId: string,
): Promise<InvoiceDto | null> {
  const [row] = await db
    .update(schema.invoice)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(schema.invoice.id, invoiceId))
    .returning({ id: schema.invoice.id });
  return row ? getInvoice(db, invoiceId) : null;
}

/** Hard-deletes an invoice (line items cascade). False when unknown. */
export async function deleteInvoice(db: DB, invoiceId: string): Promise<boolean> {
  const rows = await db
    .delete(schema.invoice)
    .where(eq(schema.invoice.id, invoiceId))
    .returning({ id: schema.invoice.id });
  return rows.length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Coach read (own clinic's invoices — read-only, tenant-scoped)              */
/* -------------------------------------------------------------------------- */

/** This clinic's own invoices (read-only), newest first. Scoped to the tenant. */
export async function listMyInvoices(ctx: TenantContext): Promise<InvoiceDto[]> {
  return loadInvoices(ctx.db, eq(schema.invoice.clinicId, ctx.clinicId));
}

/**
 * The clinic's oldest still-unpaid invoice, or null. Drives the coach's billing
 * banner and the "Assinar" panel, which reuses an open fatura rather than
 * stacking a second one on top of it.
 */
export async function findOpenInvoice(
  ctx: TenantContext,
): Promise<InvoiceDto | null> {
  const invoices = await listMyInvoices(ctx);
  const pending = invoices
    .filter((inv) => inv.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending[0] ?? null;
}

/**
 * Raises the fatura for a coach who asked to subscribe (the in-app "Assinar"
 * flow, roadmap item 0 Phase 1).
 *
 * The **price comes from `PLAN_PRICE_CENTS`, never from the caller** — the
 * client only names a plan. An existing unpaid fatura is returned as-is instead
 * of creating another, so repeatedly opening the panel can't stack charges.
 *
 * Raising the fatura does NOT grant the plan: an admin still confirms the money
 * landed and marks it paid. That deliberate separation is what makes it safe to
 * let a coach trigger this.
 */
export async function requestSubscription(
  ctx: TenantContext,
  plan: Plan,
): Promise<{ invoice: InvoiceDto; created: boolean } | { error: "unpriced" }> {
  const priceCents = PLAN_PRICE_CENTS[plan];
  // Enterprise is "sob consulta" — there is no self-serve price to bill.
  if (priceCents === null || priceCents <= 0) return { error: "unpriced" };

  const existing = await findOpenInvoice(ctx);
  if (existing) return { invoice: existing, created: false };

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const due = new Date(today);
  due.setDate(due.getDate() + 7);

  const invoice = await createInvoice(
    ctx.db as unknown as DB,
    ctx.clinicId,
    {
      competencia: `${iso(today).slice(0, 7)}-01`,
      issuedAt: iso(today),
      dueDate: iso(due),
      planSnapshot: plan,
      discountCents: 0,
      discountReason: null,
      notes: "Assinatura solicitada pelo coach no app.",
      lineItems: [
        { description: `Plano ${PLAN_META[plan].name} — mensalidade`, amountCents: priceCents },
      ],
    },
    ctx.userId,
  );
  if (!invoice) return { error: "unpriced" };
  return { invoice, created: true };
}
