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
 * Marks an invoice paid by hand (records the date + payment method) **and moves
 * the clinic onto the plan the invoice was raised for**, in one transaction and
 * audited in `clinic_plan_change`.
 *
 * They were separate actions until a paying coach sat on Free because only the
 * first one happened. Admin-only. See {@link billing.markInvoicePaid}.
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

    const invoice = await billing.markInvoicePaid(
      db,
      id,
      parsed.data,
      session.user.id,
    );
    if (!invoice) return notFound("Fatura não encontrada.");

    logger.info("admin.invoice.paid", {
      invoiceId: id,
      paymentMethod: parsed.data.paymentMethod,
      plan: invoice.planSnapshot,
      by: session.user.id,
    });
    return NextResponse.json({ invoice });
  },
);
