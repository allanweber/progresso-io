import { NextResponse } from "next/server";

import { db } from "@/db";
import { billing } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

type Params = { params: Promise<{ id: string }> };

/**
 * Cancels an invoice (keeps it in the ledger with `canceled` status). Admin-only;
 * does not touch the clinic's plan. See {@link billing.cancelInvoice}.
 */
export const POST = withRoute<Params>(
  "admin.invoices.cancel",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const invoice = await billing.cancelInvoice(db, id);
    if (!invoice) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.canceled", { invoiceId: id, by: session.user.id });
    return NextResponse.json({ invoice });
  },
);
