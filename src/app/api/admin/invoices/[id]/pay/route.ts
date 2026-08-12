import { NextResponse } from "next/server";

import { db } from "@/db";
import { markPaidSchema } from "@/lib/billing";
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
 * Marks an invoice paid by hand (records the date + payment method). This is a
 * ledger action only — because plan and invoices are independent, it does NOT
 * change the clinic's plan. Admin-only. See {@link billing.markInvoicePaid}.
 */
export const POST = withRoute<Params>(
  "admin.invoices.pay",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = markPaidSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const invoice = await billing.markInvoicePaid(db, id, parsed.data);
    if (!invoice) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.paid", {
      invoiceId: id,
      paymentMethod: parsed.data.paymentMethod,
      by: session.user.id,
    });
    return NextResponse.json({ invoice });
  },
);
