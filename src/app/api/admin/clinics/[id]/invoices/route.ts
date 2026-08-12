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

/** A clinic's invoices (admin), newest number first. See {@link billing.listInvoicesForClinic}. */
export const GET = withRoute<Params>(
  "admin.clinics.invoices.list",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Clínica não encontrada.");

    const invoices = await billing.listInvoicesForClinic(db, id);
    return NextResponse.json({ invoices });
  },
);

/**
 * Creates a manual invoice for a clinic (admin). Assigns the next platform-wide
 * sequential number; the total is derived from the line items minus the discount,
 * never trusted from the client. This is a pure ledger entry — it does NOT change
 * the clinic's plan. See {@link billing.createInvoice}.
 */
export const POST = withRoute<Params>(
  "admin.clinics.invoices.create",
  async (request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Clínica não encontrada.");

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const parsed = invoiceWriteSchema.safeParse(body.data);
    if (!parsed.success) return validationError(parsed.error);

    const invoice = await billing.createInvoice(db, id, parsed.data, session.user.id);
    if (!invoice) return notFound("Clínica não encontrada.");

    logger.info("admin.invoice.created", {
      clinicId: id,
      invoiceId: invoice.id,
      number: invoice.number,
      by: session.user.id,
    });
    return NextResponse.json({ invoice }, { status: 201 });
  },
);
