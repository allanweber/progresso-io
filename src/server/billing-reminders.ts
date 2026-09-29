import { eq } from "drizzle-orm";

import { db, schema, type DB } from "@/db";
import type { InvoiceReminderChannel } from "@/db/schema";
import { addDays, daysBetween, todayYmd } from "@/lib/calendar";
import { formatBRL } from "@/lib/billing";
import { sendInvoiceDueEmail } from "@/lib/email";
import { normalizePhone } from "@/lib/phone";
import { renderTemplate } from "@/lib/whatsapp-inbox";
import { getWhatsAppProvider } from "@/lib/whatsapp-provider";
import { billing, plans, whatsapp } from "@/server/dal";
import { logger } from "@/server/observability";
import { renderInvoicePdf } from "@/server/invoice-pdf";
import type { TenantContext } from "@/server/tenant";

const REMINDER_WINDOW_DAYS = 3;

/**
 * The scheduled fatura-due reminder (issue #99) — cross-tenant, session-less,
 * same shape as `runCheckinReminders` in `whatsapp-automations.ts` but kept in
 * its own file: this messages the **coach about their own subscription**, not
 * a clinic messaging its students, so it lives next to the billing domain
 * instead.
 *
 * No fixed steps: a pending invoice enters the window once its `dueDate` is
 * within `REMINDER_WINDOW_DAYS`, and from then on it's reminded **every day**
 * the cron runs — before the due date, on it, and for as long as it stays
 * unpaid afterwards — until an admin marks it paid or canceled.
 *
 * Idempotent per (invoice, calendar day) via the `invoice_reminder` table
 * (`billing.listInvoicesDueForReminder` / `recordInvoiceReminderSent`), so a
 * same-day retry or double cron-fire can't double-message.
 *
 * Channel per invoice: **WhatsApp** when the clinic's plan includes it
 * (`plans.canUseWhatsapp`) AND it has a usable number in `clinic.whatsapp`
 * (Settings → Portal); **e-mail** otherwise — a Free clinic, or a paid one
 * that never filled the field in. E-mail always attaches the fatura PDF
 * (`renderInvoicePdf`, the same generator behind the coach's PDF download).
 *
 * Best-effort per invoice: a bad number or a PDF failure is logged and
 * skipped, never thrown, so one clinic's trouble can't stop the rest.
 */

/** "vence em N dias" / "vence hoje" / "venceu há N dias", from the day gap. */
function duePhrase(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days > 1) return `vence em ${days} dias`;
  if (days === 1) return "vence amanhã";
  if (days === 0) return "vence hoje";
  const late = -days;
  return late === 1 ? "venceu há 1 dia" : `venceu há ${late} dias`;
}

/** The clinic + its owner, the identity every reminder is attributed to. */
async function loadClinicOwner(database: DB, clinicId: string) {
  const [row] = await database
    .select({
      clinicName: schema.clinic.name,
      ownerUserId: schema.clinic.ownerUserId,
      whatsapp: schema.clinic.whatsapp,
      ownerName: schema.user.name,
      ownerEmail: schema.user.email,
    })
    .from(schema.clinic)
    .innerJoin(schema.user, eq(schema.user.id, schema.clinic.ownerUserId))
    .where(eq(schema.clinic.id, clinicId));
  return row ?? null;
}

export async function runInvoiceReminders(
  appUrl: string,
  database: DB = db,
  today: string = todayYmd(),
): Promise<{ invoicesProcessed: number; whatsappSent: number; emailSent: number }> {
  const dashboardUrl = `${appUrl}/coach`;
  let invoicesProcessed = 0;
  let whatsappSent = 0;
  let emailSent = 0;

  const windowEnd = addDays(today, REMINDER_WINDOW_DAYS);
  const candidates = await billing.listInvoicesDueForReminder(
    database,
    today,
    windowEnd,
  );

  for (const candidate of candidates) {
    try {
      const owner = await loadClinicOwner(database, candidate.clinicId);
      if (!owner) continue;

      const ctx: TenantContext = {
        db: database,
        clinicId: candidate.clinicId,
        userId: owner.ownerUserId,
        role: "coach",
      };
      const firstName = owner.ownerName.split(" ")[0] || owner.ownerName;
      const periodo = duePhrase(candidate.dueDate, today);
      const phone = normalizePhone(owner.whatsapp ?? "");

      let channel: InvoiceReminderChannel | null = null;

      if (phone && (await plans.canUseWhatsapp(ctx))) {
        const tpl = await whatsapp.resolveTemplate(ctx, "invoice_due");
        if (tpl) {
          const renderedBody = renderTemplate(tpl.body, {
            nome: firstName,
            periodo,
            link: dashboardUrl,
          });
          await getWhatsAppProvider().sendTemplateMessage(
            phone,
            tpl.key,
            renderedBody,
          );
          channel = "whatsapp";
          whatsappSent += 1;
        }
      }

      if (!channel) {
        const invoice = await billing.getInvoice(database, candidate.id);
        if (!invoice) continue;
        const invoiceLabel = `#${String(invoice.number).padStart(4, "0")}`;
        const pdf = await renderInvoicePdf(invoice, owner.clinicName);
        await sendInvoiceDueEmail({
          email: owner.ownerEmail,
          firstName,
          duePhrase: periodo,
          amount: formatBRL(invoice.totalCents),
          invoiceLabel,
          appUrl: dashboardUrl,
          pdf,
          pdfFilename: `fatura-${String(invoice.number).padStart(4, "0")}.pdf`,
        });
        channel = "email";
        emailSent += 1;
      }

      await billing.recordInvoiceReminderSent(database, candidate.id, today, channel);
      invoicesProcessed += 1;
    } catch (error) {
      logger.error("billing.invoice_reminder_failed", {
        err: error,
        invoiceId: candidate.id,
      });
    }
  }

  return { invoicesProcessed, whatsappSent, emailSent };
}
