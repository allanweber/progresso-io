"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { AdminClinicDto } from "@/lib/admin";
import { PLAN_META } from "@/lib/plans";
import {
  formatBRL,
  formatCompetencia,
  formatDateBR,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type InvoiceDto,
} from "@/lib/billing";

type InvoicePrintResponse = {
  invoice: InvoiceDto;
  clinic: AdminClinicDto | null;
};

/**
 * A print-friendly invoice ("Save as PDF" via the browser). The dashboard chrome
 * is hidden under `@media print` (see DashboardShell's `print:` classes), so the
 * printed page is just this document. Admin-gated by the /admin layout.
 */
export default function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-invoice-print", id],
    queryFn: () => apiFetch<InvoicePrintResponse>(`/api/admin/invoices/${id}`),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Fatura não encontrada."}
      </p>
    );
  }

  const { invoice, clinic } = data;
  const statusLabel =
    invoice.status === "pending" && invoice.overdue
      ? "Vencida"
      : INVOICE_STATUS_LABELS[invoice.status];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Toolbar — screen only */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a
          href={`/admin/clinics/${invoice.clinicId}`}
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          ← Voltar para a clínica
        </a>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir / PDF
        </Button>
      </div>

      {/* The document */}
      <article className="rounded-2xl border border-border bg-white p-8 shadow-[0_1px_8px_rgba(15,23,42,0.05)] print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
          <div>
            <div className="text-xl font-bold text-foreground">Progresso</div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              Plataforma de gestão para consultorias esportivas
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-foreground">
              Fatura #{invoice.number}
            </div>
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {statusLabel}
            </div>
          </div>
        </header>

        {/* Parties + meta */}
        <section className="grid grid-cols-2 gap-6 py-6 text-[13px]">
          <div>
            <div className="font-semibold text-muted-foreground">Cobrança para</div>
            <div className="mt-1 font-medium text-foreground">
              {clinic?.name ?? "—"}
            </div>
            {clinic?.ownerName && (
              <div className="text-muted-foreground">{clinic.ownerName}</div>
            )}
            {clinic?.ownerEmail && (
              <div className="text-muted-foreground">{clinic.ownerEmail}</div>
            )}
          </div>
          <div className="text-right">
            <MetaRow label="Competência" value={formatCompetencia(invoice.competencia)} />
            <MetaRow label="Emissão" value={formatDateBR(invoice.issuedAt)} />
            <MetaRow label="Vencimento" value={formatDateBR(invoice.dueDate)} />
            <MetaRow label="Plano" value={PLAN_META[invoice.planSnapshot].name} />
            {invoice.status === "paid" && (
              <>
                <MetaRow label="Pago em" value={formatDateBR(invoice.paidAt)} />
                {invoice.paymentMethod && (
                  <MetaRow
                    label="Forma"
                    value={PAYMENT_METHOD_LABELS[invoice.paymentMethod]}
                  />
                )}
              </>
            )}
          </div>
        </section>

        {/* Line items */}
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 font-semibold">Descrição</th>
              <th className="py-2 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-border/60">
                <td className="py-2 text-foreground">{li.description}</td>
                <td className="py-2 text-right text-foreground">
                  {formatBRL(li.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <section className="mt-4 flex justify-end">
          <div className="w-64 space-y-1 text-[13px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatBRL(invoice.subtotalCents)}</span>
            </div>
            {invoice.discountCents > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Desconto
                  {invoice.discountReason ? ` (${invoice.discountReason})` : ""}
                </span>
                <span>− {formatBRL(invoice.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 text-base font-semibold text-foreground">
              <span>Total</span>
              <span>{formatBRL(invoice.totalCents)}</span>
            </div>
          </div>
        </section>

        {invoice.notes && (
          <section className="mt-6 border-t border-border pt-4 text-[13px]">
            <div className="font-semibold text-muted-foreground">Observações</div>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{invoice.notes}</p>
          </section>
        )}
      </article>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
