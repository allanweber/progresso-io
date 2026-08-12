import { NextResponse } from "next/server";

import { db } from "@/db";
import { invoiceWriteSchema } from "@/lib/billing";
import { billing } from "@/server/dal";
import {
  forbidden,
  isUuid,
  notFound,
  readJson,
  validationError,
} from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

type Params = { params: Promise<{ id: string }> };

/**
 * Replaces an invoice's editable fields + line items (admin). The sequential
 * number and status are untouched; the total is recomputed from the new line
 * items minus the discount. See {@link billing.updateInvoice}.
 */
export const PUT = withRoute<Params>(
  "admin.invoices.update",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

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
export const DELETE = withRoute<Params>(
  "admin.invoices.delete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const deleted = await billing.deleteInvoice(db, id);
    if (!deleted) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.deleted", { invoiceId: id, by: session.user.id });
    return NextResponse.json({ ok: true });
  },
);
