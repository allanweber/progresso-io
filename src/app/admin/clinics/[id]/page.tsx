"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Printer, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { Plan } from "@/db/schema";
import {
  type AdminClinicDto,
  type AdminClinicLimitsDto,
  clinicLimitsUpdateSchema,
} from "@/lib/admin";
import { PLAN_META } from "@/lib/plans";
import {
  centsToReais,
  formatBRL,
  formatCompetencia,
  formatDateBR,
  INVOICE_STATUS_LABELS,
  invoiceTotals,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  PLAN_PRICE_CENTS,
  PLAN_VALUES,
  reaisToCents,
  type InvoiceDto,
  type PlanChangeDto,
} from "@/lib/billing";

type ClinicDetailResponse = {
  clinic: AdminClinicDto;
  planChanges: PlanChangeDto[];
  invoices: InvoiceDto[];
  limits: AdminClinicLimitsDto;
};

/** Today's month ("YYYY-MM") and day ("YYYY-MM-DD") for prefilling invoice dates. */
function todayParts() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { month: `${y}-${m}`, day: `${y}-${m}-${d}` };
}

function InvoiceStatusBadge({ invoice }: { invoice: InvoiceDto }) {
  if (invoice.status === "paid") {
    return <Badge variant="clinic">{INVOICE_STATUS_LABELS.paid}</Badge>;
  }
  if (invoice.status === "canceled") {
    return <Badge variant="neutral">{INVOICE_STATUS_LABELS.canceled}</Badge>;
  }
  if (invoice.overdue) {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        Vencida
      </span>
    );
  }
  return <Badge variant="warn">{INVOICE_STATUS_LABELS.pending}</Badge>;
}

export default function AdminClinicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["admin-clinic", id],
    queryFn: () => apiFetch<ClinicDetailResponse>(`/api/admin/clinics/${id}`),
  });

  const [invoiceDialog, setInvoiceDialog] = useState<
    { mode: "create" } | { mode: "edit"; invoice: InvoiceDto } | null
  >(null);
  const [payTarget, setPayTarget] = useState<InvoiceDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InvoiceDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceDto | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-clinic", id] });

  const cancelMut = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<{ invoice: InvoiceDto }>(
        `/api/admin/invoices/${invoiceId}/cancel`,
        { method: "POST" },
      ),
    onSuccess: () => {
      invalidate();
      setCancelTarget(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<{ ok: true }>(`/api/admin/invoices/${invoiceId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-destructive">
          {detail.error instanceof Error
            ? detail.error.message
            : "Clínica não encontrada."}
        </p>
      </div>
    );
  }

  const { clinic, planChanges, invoices, limits } = detail.data;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{clinic.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {clinic.ownerName ?? "—"}
          {clinic.ownerEmail ? ` · ${clinic.ownerEmail}` : ""} ·{" "}
          {clinic.coachCount} coach(es) · {clinic.studentCount} aluno(s)
        </p>
      </div>

      {/* Plan control + history */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Plano</h2>
            <p className="text-[13px] text-muted-foreground">
              Alterar o plano libera ou revoga na hora o limite de alunos e o
              portal com marca própria. As faturas são independentes.
            </p>
          </div>
          <Badge variant="base">{PLAN_META[clinic.plan as Plan].name}</Badge>
        </div>

        <PlanForm clinicId={id} currentPlan={clinic.plan as Plan} onDone={invalidate} />

        {planChanges.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13px] font-semibold text-muted-foreground">
              Histórico de alterações
            </h3>
            <ul className="mt-2 space-y-2">
              {planChanges.map((ch) => (
                <li key={ch.id} className="text-[13px] text-muted-foreground">
                  <span className="text-foreground">
                    {ch.fromPlan ? PLAN_META[ch.fromPlan].name : "—"} →{" "}
                    {PLAN_META[ch.toPlan].name}
                  </span>{" "}
                  · {formatDateBR(ch.createdAt.slice(0, 10))}
                  {ch.changedByName ? ` · ${ch.changedByName}` : ""}
                  {ch.note ? ` · “${ch.note}”` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Per-clinic limit overrides */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <h2 className="text-lg font-semibold text-foreground">
          Limites desta clínica
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Ajuste os limites só para esta clínica, sem trocar o plano. Deixe em
          branco (ou “Padrão do plano”) para herdar o plano {limits.planName}.
        </p>
        <LimitsForm clinicId={id} limits={limits} onDone={invalidate} />
      </section>

      {/* Invoices */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_8px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Faturas</h2>
          <Button size="sm" onClick={() => setInvoiceDialog({ mode: "create" })}>
            <Plus className="size-4" />
            Nova fatura
          </Button>
        </div>

        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma fatura para esta clínica.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-foreground">
                      #{inv.number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCompetencia(inv.competencia)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateBR(inv.dueDate)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      {formatBRL(inv.totalCents)}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={inv} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPayTarget(inv)}
                          >
                            Marcar paga
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          aria-label={`Imprimir fatura ${inv.number}`}
                        >
                          <Link
                            href={`/admin/invoices/${inv.id}/print`}
                            target="_blank"
                          >
                            <Printer className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setInvoiceDialog({ mode: "edit", invoice: inv })
                          }
                          aria-label={`Editar fatura ${inv.number}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {inv.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCancelTarget(inv)}
                            aria-label={`Cancelar fatura ${inv.number}`}
                          >
                            Cancelar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(inv)}
                          aria-label={`Excluir fatura ${inv.number}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {invoiceDialog && (
        <InvoiceDialog
          clinicId={id}
          currentPlan={clinic.plan as Plan}
          state={invoiceDialog}
          onClose={() => setInvoiceDialog(null)}
          onSaved={() => {
            invalidate();
            setInvoiceDialog(null);
          }}
        />
      )}

      {payTarget && (
        <MarkPaidDialog
          invoice={payTarget}
          onClose={() => setPayTarget(null)}
          onSaved={() => {
            invalidate();
            setPayTarget(null);
          }}
        />
      )}

      {/* Cancel confirm */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o && !cancelMut.isPending) setCancelTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar fatura</DialogTitle>
          </DialogHeader>
          {cancelTarget && (
            <p className="text-[13px] text-muted-foreground">
              A fatura{" "}
              <strong className="text-foreground">#{cancelTarget.number}</strong>{" "}
              será marcada como cancelada. Ela permanece no histórico.
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={cancelMut.isPending}>
                Voltar
              </Button>
            </DialogClose>
            <Button
              onClick={() => cancelTarget && cancelMut.mutate(cancelTarget.id)}
              disabled={cancelMut.isPending}
            >
              {cancelMut.isPending ? "Cancelando…" : "Cancelar fatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o && !deleteMut.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir fatura</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-[13px] text-muted-foreground">
              A fatura{" "}
              <strong className="text-foreground">#{deleteTarget.number}</strong>{" "}
              e seus itens serão excluídos permanentemente. Esta ação não pode ser
              desfeita.
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleteMut.isPending}>
                Voltar
              </Button>
            </DialogClose>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/maintenance"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar para Clínicas
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plan control                                                               */
/* -------------------------------------------------------------------------- */

function PlanForm({
  clinicId,
  currentPlan,
  onDone,
}: {
  clinicId: string;
  currentPlan: Plan;
  onDone: () => void;
}) {
  const mutation = useMutation({
    mutationFn: (values: { plan: Plan; note: string }) =>
      apiFetch<{ ok: true; changed: boolean }>(
        `/api/admin/clinics/${clinicId}/plan`,
        {
          method: "PUT",
          body: JSON.stringify({
            plan: values.plan,
            note: values.note.trim() || null,
          }),
        },
      ),
    onSuccess: onDone,
  });

  const form = useForm({
    defaultValues: { plan: currentPlan, note: "" },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        form.reset({ plan: value.plan, note: "" });
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,180px)_1fr_auto] sm:items-end"
    >
      <form.Field name="plan">
        {(field) => (
          <div className="space-y-1.5">
            <Label htmlFor="plan-select">Plano</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v as Plan)}
            >
              <SelectTrigger id="plan-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_VALUES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLAN_META[p].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Field name="note">
        {(field) => (
          <Field
            id="plan-note"
            label="Nota (opcional)"
            placeholder="Motivo da alteração"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.plan}>
        {(plan) => (
          <Button type="submit" disabled={mutation.isPending || plan === currentPlan}>
            {mutation.isPending ? "Salvando…" : "Salvar plano"}
          </Button>
        )}
      </form.Subscribe>

      {banner && (
        <p className="text-[13px] text-destructive sm:col-span-3">{banner}</p>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Invoice create / edit dialog                                               */
/* -------------------------------------------------------------------------- */

type InvoiceLine = { description: string; amount: string };

/** The default subscription line for a plan (priced plans prefill the amount). */
function subscriptionLineFor(plan: Plan): InvoiceLine {
  const price = PLAN_PRICE_CENTS[plan];
  return {
    description: `Assinatura ${PLAN_META[plan].name}`,
    amount: price != null ? centsToReais(price) : "",
  };
}

/** Whether a line still looks auto-generated (blank or a "Assinatura …" line). */
function isAutoSubscriptionLine(line: InvoiceLine): boolean {
  return line.description.trim() === "" || line.description.startsWith("Assinatura ");
}

type InvoiceFormValues = {
  competencia: string; // "YYYY-MM"
  issuedAt: string; // "YYYY-MM-DD"
  dueDate: string; // "YYYY-MM-DD"
  planSnapshot: Plan;
  discount: string; // reais
  discountReason: string;
  notes: string;
  lineItems: InvoiceLine[];
};

function InvoiceDialog({
  clinicId,
  currentPlan,
  state,
  onClose,
  onSaved,
}: {
  clinicId: string;
  currentPlan: Plan;
  state: { mode: "create" } | { mode: "edit"; invoice: InvoiceDto };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { month, day } = useMemo(() => todayParts(), []);

  const initial: InvoiceFormValues = useMemo(() => {
    if (state.mode === "edit") {
      const inv = state.invoice;
      return {
        competencia: inv.competencia.slice(0, 7),
        issuedAt: inv.issuedAt,
        dueDate: inv.dueDate,
        planSnapshot: inv.planSnapshot,
        discount: inv.discountCents ? centsToReais(inv.discountCents) : "",
        discountReason: inv.discountReason ?? "",
        notes: inv.notes ?? "",
        lineItems: inv.lineItems.map((li) => ({
          description: li.description,
          amount: centsToReais(li.amountCents),
        })),
      };
    }
    // New invoice: default to the clinic's current plan with its subscription
    // line already filled in — the common case is billing that plan.
    return {
      competencia: month,
      issuedAt: day,
      dueDate: day,
      planSnapshot: currentPlan,
      discount: "",
      discountReason: "",
      notes: "",
      lineItems: [subscriptionLineFor(currentPlan)],
    };
  }, [state, month, day, currentPlan]);

  const mutation = useMutation({
    mutationFn: (value: InvoiceFormValues) => {
      const payload = {
        competencia: `${value.competencia}-01`,
        issuedAt: value.issuedAt,
        dueDate: value.dueDate,
        planSnapshot: value.planSnapshot,
        discountCents: reaisToCents(value.discount || "0"),
        discountReason: value.discountReason.trim() || null,
        notes: value.notes.trim() || null,
        lineItems: value.lineItems.map((li) => ({
          description: li.description.trim(),
          amountCents: reaisToCents(li.amount || "0"),
        })),
      };
      const url =
        state.mode === "create"
          ? `/api/admin/clinics/${clinicId}/invoices`
          : `/api/admin/invoices/${state.invoice.id}`;
      return apiFetch<{ invoice: InvoiceDto }>(url, {
        method: state.mode === "create" ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {state.mode === "create" ? "Nova fatura" : `Editar fatura #${state.invoice.number}`}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          {banner && (
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {banner}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field name="competencia">
              {(field) => (
                <Field
                  id="competencia"
                  label="Competência"
                  type="month"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
            <form.Field name="planSnapshot">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor="plan-snapshot">Plano de referência</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(v) => {
                      const plan = v as Plan;
                      field.handleChange(plan);
                      // Keep the auto subscription line in sync with the chosen
                      // plan — but never clobber a line the admin edited by hand.
                      const items = form.getFieldValue("lineItems");
                      if (items.length === 1 && isAutoSubscriptionLine(items[0])) {
                        form.setFieldValue("lineItems", [subscriptionLineFor(plan)]);
                      }
                    }}
                  >
                    <SelectTrigger id="plan-snapshot">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_VALUES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PLAN_META[p].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            <form.Field name="issuedAt">
              {(field) => (
                <Field
                  id="issued-at"
                  label="Emissão"
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
            <form.Field name="dueDate">
              {(field) => (
                <Field
                  id="due-date"
                  label="Vencimento"
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label>Itens</Label>
            <form.Field name="lineItems" mode="array">
              {(field) => (
                <div className="space-y-2">
                  {field.state.value.map((_, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <form.Field name={`lineItems[${i}].description`}>
                        {(sub) => (
                          <Input
                            aria-label={`Descrição do item ${i + 1}`}
                            placeholder="Descrição"
                            className="flex-1"
                            value={sub.state.value}
                            onChange={(e) => sub.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                      <form.Field name={`lineItems[${i}].amount`}>
                        {(sub) => (
                          <Input
                            aria-label={`Valor do item ${i + 1}`}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0,00"
                            className="w-32"
                            value={sub.state.value}
                            onChange={(e) => sub.handleChange(e.target.value)}
                          />
                        )}
                      </form.Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.removeValue(i)}
                        disabled={field.state.value.length === 1}
                        aria-label={`Remover item ${i + 1}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.pushValue({ description: "", amount: "" })}
                  >
                    <Plus className="size-4" />
                    Adicionar item
                  </Button>
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field name="discount">
              {(field) => (
                <Field
                  id="discount"
                  label="Desconto (R$)"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
            <form.Field name="discountReason">
              {(field) => (
                <Field
                  id="discount-reason"
                  label="Motivo do desconto (opcional)"
                  placeholder="Ex.: fidelidade"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
          </div>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="invoice-notes">Observações (opcional)</Label>
                <Textarea
                  id="invoice-notes"
                  rows={2}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </div>
            )}
          </form.Field>

          {/* Live total */}
          <form.Subscribe
            selector={(s) => [s.values.lineItems, s.values.discount] as const}
          >
            {([items, discount]) => {
              const { subtotalCents, totalCents } = invoiceTotals(
                items.map((li) => ({ amountCents: reaisToCents(li.amount || "0") })),
                reaisToCents(discount || "0"),
              );
              return (
                <div className="rounded-[10px] bg-muted/50 px-4 py-3 text-[13px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatBRL(subtotalCents)}</span>
                  </div>
                  <div className="mt-1 flex justify-between font-semibold text-foreground">
                    <span>Total</span>
                    <span>{formatBRL(totalCents)}</span>
                  </div>
                </div>
              );
            }}
          </form.Subscribe>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Salvando…"
                : state.mode === "create"
                  ? "Criar fatura"
                  : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mark-paid dialog                                                           */
/* -------------------------------------------------------------------------- */

function MarkPaidDialog({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { day } = useMemo(() => todayParts(), []);

  const mutation = useMutation({
    mutationFn: (value: { paidAt: string; paymentMethod: string }) =>
      apiFetch<{ invoice: InvoiceDto }>(
        `/api/admin/invoices/${invoice.id}/pay`,
        { method: "POST", body: JSON.stringify(value) },
      ),
    onSuccess: onSaved,
  });

  const form = useForm({
    defaultValues: { paidAt: day, paymentMethod: "pix" as string },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        /* surfaced via mutation.error */
      }
    },
  });

  const banner =
    mutation.error instanceof ApiError ? mutation.error.message : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar fatura #{invoice.number} como paga</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          {banner && (
            <div className="rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {banner}
            </div>
          )}
          <form.Field name="paidAt">
            {(field) => (
              <Field
                id="paid-at"
                label="Data do pagamento"
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <form.Field name="paymentMethod">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="payment-method">Forma de pagamento</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v)}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_VALUES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Per-clinic limit overrides                                                 */
/* -------------------------------------------------------------------------- */

/** "50" or "" — the input value for an override cap (empty = inherit the plan). */
function overrideInput(value: number | null): string {
  return value === null ? "" : String(value);
}

/** A nullable boolean override → the 3-state select value. */
function triState(value: boolean | null): "inherit" | "yes" | "no" {
  return value === null ? "inherit" : value ? "yes" : "no";
}

/** The 3-state select value → a nullable boolean override. */
function fromTriState(value: "inherit" | "yes" | "no"): boolean | null {
  return value === "inherit" ? null : value === "yes";
}

/** A plan default rendered for the input placeholder ("Padrão: 50" / "ilimitado"). */
function planDefaultHint(value: number | null): string {
  return `Padrão: ${value === null ? "ilimitado" : value}`;
}

function LimitsForm({
  clinicId,
  limits,
  onDone,
}: {
  clinicId: string;
  limits: AdminClinicLimitsDto;
  onDone: () => void;
}) {
  const [students, setStudents] = useState(
    overrideInput(limits.maxStudentsOverride),
  );
  const [coaches, setCoaches] = useState(
    overrideInput(limits.maxCoachesOverride),
  );
  const [whatsapp, setWhatsapp] = useState<"inherit" | "yes" | "no">(
    triState(limits.whatsappOverride),
  );
  const [archive, setArchive] = useState<"inherit" | "yes" | "no">(
    triState(limits.archiveOverride),
  );
  const [calendar, setCalendar] = useState<"inherit" | "yes" | "no">(
    triState(limits.calendarOverride),
  );

  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ limits: AdminClinicLimitsDto }>(
        `/api/admin/clinics/${clinicId}/limits`,
        {
          method: "PUT",
          body: JSON.stringify(
            clinicLimitsUpdateSchema.parse({
              maxStudentsOverride:
                students.trim() === "" ? null : Number(students),
              maxCoachesOverride: coaches.trim() === "" ? null : Number(coaches),
              whatsappOverride: fromTriState(whatsapp),
              archiveOverride: fromTriState(archive),
              calendarOverride: fromTriState(calendar),
            }),
          ),
        },
      ),
    onSuccess: onDone,
  });

  const dirty =
    students !== overrideInput(limits.maxStudentsOverride) ||
    coaches !== overrideInput(limits.maxCoachesOverride) ||
    whatsapp !== triState(limits.whatsappOverride) ||
    archive !== triState(limits.archiveOverride) ||
    calendar !== triState(limits.calendarOverride);
  const banner = save.error instanceof ApiError ? save.error.message : undefined;

  return (
    <div className="mt-4">
      {banner ? (
        <div className="mb-3 rounded-[10px] bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          {banner}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="lim-students">Máx. alunos</Label>
          <Input
            id="lim-students"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder={planDefaultHint(limits.planMaxStudents)}
            value={students}
            onChange={(e) => setStudents(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-coaches">Máx. coaches</Label>
          <Input
            id="lim-coaches"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder={planDefaultHint(limits.planMaxCoaches)}
            value={coaches}
            onChange={(e) => setCoaches(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-whatsapp">WhatsApp</Label>
          <Select
            value={whatsapp}
            onValueChange={(v) => setWhatsapp(v as "inherit" | "yes" | "no")}
          >
            <SelectTrigger id="lim-whatsapp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">
                Padrão do plano ({limits.planWhatsapp ? "incluído" : "não"})
              </SelectItem>
              <SelectItem value="yes">Incluído</SelectItem>
              <SelectItem value="no">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-archive">Arquivar alunos</Label>
          <Select
            value={archive}
            onValueChange={(v) => setArchive(v as "inherit" | "yes" | "no")}
          >
            <SelectTrigger id="lim-archive">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">
                Padrão do plano ({limits.planArchive ? "sim" : "não"})
              </SelectItem>
              <SelectItem value="yes">Permitir</SelectItem>
              <SelectItem value="no">Não (excluir)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lim-calendar">Calendário</Label>
          <Select
            value={calendar}
            onValueChange={(v) => setCalendar(v as "inherit" | "yes" | "no")}
          >
            <SelectTrigger id="lim-calendar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">
                Padrão do plano ({limits.planCalendar ? "incluído" : "não"})
              </SelectItem>
              <SelectItem value="yes">Incluído</SelectItem>
              <SelectItem value="no">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Salvando…" : "Salvar limites"}
        </Button>
      </div>
    </div>
  );
}
