import { NextResponse } from "next/server";

import { db } from "@/db";
import { invoiceWriteSchema } from "@/lib/billing";
import { admin, billing } from "@/server/dal";
import {
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

type Params = { params: Promise<{ id: string }> };

/**
 * One invoice (with line items + derived totals) plus its clinic — the payload
 * for the printable invoice view. Admin-only. See {@link billing.getInvoice}.
 */
export const GET = withAdmin<Params>(
  "admin.invoices.detail",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const invoice = await billing.getInvoice(db, id);
    if (!invoice) return notFound("Fatura não encontrada.");

    const clinic = await admin.getClinicAdminRow(db, invoice.clinicId);
    return NextResponse.json({ invoice, clinic });
  },
);

/**
 * Replaces an invoice's editable fields + line items (admin). The sequential
 * number and status are untouched; the total is recomputed from the new line
 * items minus the discount. See {@link billing.updateInvoice}.
 */
export const PUT = withAdmin<Params>(
  "admin.invoices.update",
  async (request, session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = invoiceWriteSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const invoice = await billing.updateInvoice(db, id, parsed.data);
    if (!invoice) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.updated", { invoiceId: id, by: session.user.id });
    return NextResponse.json({ invoice });
  },
);

/** Hard-deletes an invoice — line items cascade (admin). See {@link billing.deleteInvoice}. */
export const DELETE = withAdmin<Params>(
  "admin.invoices.delete",
  async (_request, session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const deleted = await billing.deleteInvoice(db, id);
    if (!deleted) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.deleted", { invoiceId: id, by: session.user.id });
    return NextResponse.json({ ok: true });
  },
);
