import { NextResponse } from "next/server";

import { billing, clinics } from "@/server/dal";
import { renderInvoicePdf } from "@/server/invoice-pdf";
import { forbidden, isUuid, notFound, unauthorized } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getTenantContext } from "@/server/tenant";

type Params = { params: Promise<{ id: string }> };

/**
 * The clinic's fatura as a PDF, for the coach to open/print. Read-only and
 * strictly tenant-scoped: the invoice must belong to the session's clinic
 * (`getInvoice` isn't clinic-scoped, so we check `clinicId` here) — never
 * trusting the id from the URL alone. Coach-only.
 */
export const GET = withRoute<Params>(
  "coach.invoices.pdf",
  async (_request, { params }) => {
    const ctx = await getTenantContext();
    if (!ctx) return unauthorized();
    if (ctx.role !== "coach") return forbidden();

    const { id } = await params;
    if (!isUuid(id)) return notFound("Fatura não encontrada.");

    const invoice = await billing.getInvoice(ctx.db, id);
    if (!invoice || invoice.clinicId !== ctx.clinicId) {
      return notFound("Fatura não encontrada.");
    }

    const clinic = await clinics.getClinic(ctx);
    const pdf = await renderInvoicePdf(invoice, clinic?.name ?? "Clínica");
    const filename = `fatura-${String(invoice.number).padStart(4, "0")}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  },
);
