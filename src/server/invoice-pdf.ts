import PDFDocument from "pdfkit";

import {
  formatBRL,
  formatCompetencia,
  formatDateBR,
  INVOICE_STATUS_LABELS,
  type InvoiceDto,
} from "@/lib/billing";
import { PLAN_META } from "@/lib/plans";

/**
 * Renders a clinic invoice (fatura) to a PDF buffer with pdfkit. Used by the
 * coach's read-only Faturas view and the calendar's invoice markers — the coach
 * can open/print the fatura the platform admin keeps. Server-only (pdfkit is a
 * Node lib; see `serverExternalPackages` in next.config).
 */

const ACCENT = "#059669";
const INK = "#0F172A";
const MUTED = "#64748B";

/** The status shown on the PDF (a pending, past-due invoice reads "Vencida"). */
function statusLabel(invoice: InvoiceDto): string {
  if (invoice.status === "pending" && invoice.overdue) return "Vencida";
  return INVOICE_STATUS_LABELS[invoice.status];
}

export function renderInvoicePdf(
  invoice: InvoiceDto,
  clinicName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const numero = `#${String(invoice.number).padStart(4, "0")}`;

    // Header — brand + invoice number.
    doc
      .fillColor(ACCENT)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text("Progresso IO", left, 50);
    doc
      .fillColor(INK)
      .fontSize(22)
      .text(`Fatura ${numero}`, left, 50, { width, align: "right" });
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(11)
      .text(clinicName, left, 78);
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .text(statusLabel(invoice).toUpperCase(), left, 78, {
        width,
        align: "right",
      });

    doc
      .moveTo(left, 108)
      .lineTo(right, 108)
      .strokeColor("#E2E8F0")
      .stroke();

    // Meta grid.
    let y = 128;
    const meta: Array<[string, string]> = [
      ["Competência", formatCompetencia(invoice.competencia)],
      ["Emissão", formatDateBR(invoice.issuedAt)],
      ["Vencimento", formatDateBR(invoice.dueDate)],
      ["Plano", PLAN_META[invoice.planSnapshot]?.name ?? invoice.planSnapshot],
    ];
    if (invoice.paidAt) {
      meta.push(["Pagamento", formatDateBR(invoice.paidAt)]);
    }
    for (const [label, value] of meta) {
      doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(label, left, y);
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(value, left, y + 12);
      y += 40;
    }

    // Line-items table.
    y += 6;
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("DESCRIÇÃO", left, y)
      .text("VALOR", left, y, { width, align: "right" });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#E2E8F0").stroke();
    y += 10;

    for (const item of invoice.lineItems) {
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(11)
        .text(item.description, left, y, { width: width - 120 });
      doc.text(formatBRL(item.amountCents), left, y, {
        width,
        align: "right",
      });
      y = doc.y + 8;
    }

    // Totals.
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#E2E8F0").stroke();
    y += 12;
    const totalsRow = (label: string, value: string, bold = false) => {
      doc
        .fillColor(bold ? INK : MUTED)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(bold ? 14 : 11)
        .text(label, left, y, { width: width - 140, align: "right" })
        .text(value, left, y, { width, align: "right" });
      y += bold ? 24 : 18;
    };
    totalsRow("Subtotal", formatBRL(invoice.subtotalCents));
    if (invoice.discountCents > 0) {
      totalsRow(
        `Desconto${invoice.discountReason ? ` (${invoice.discountReason})` : ""}`,
        `- ${formatBRL(invoice.discountCents)}`,
      );
    }
    totalsRow("Total", formatBRL(invoice.totalCents), true);

    // Notes.
    if (invoice.notes) {
      y += 12;
      doc
        .fillColor(MUTED)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text("OBSERVAÇÕES", left, y);
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(10)
        .text(invoice.notes, left, y + 14, { width });
    }

    // Footer.
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(
        "Documento gerado por Progresso IO — fatura da assinatura da clínica.",
        left,
        doc.page.height - doc.page.margins.bottom - 12,
        { width, align: "center" },
      );

    doc.end();
  });
}
