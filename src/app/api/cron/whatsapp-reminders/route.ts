import { NextResponse } from "next/server";

import { runInvoiceReminders } from "@/server/billing-reminders";
import { runCheckinReminders } from "@/server/whatsapp-automations";
import { apiError, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Daily cron entry point for every scheduled clinic-messaging job. Cross-tenant
 * and session-less. Runs two independent jobs on the same trigger:
 *
 *  - `runCheckinReminders` — walks every clinic whose preferred check-in
 *    weekday is today and messages each due student.
 *  - `runInvoiceReminders` (issue #99) — walks every clinic with a fatura due
 *    in 3 days or due today and reminds the **coach** (WhatsApp when the plan
 *    + number allow it, e-mail otherwise).
 *
 * Auth is a shared secret, never a user session: the caller must present
 * `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret: $CRON_SECRET`). If
 * `CRON_SECRET` is unset the route only runs under the dev-simulate flag
 * (`WHATSAPP_ALLOW_SIMULATE=1`) so it stays triggerable in the testing env; in
 * production with no secret configured it refuses. Both jobs are idempotent
 * (check-ins within a cadence period, invoices per invoice+step), so a
 * double-fire won't double-message either one.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const header = request.headers.get("x-cron-secret");
    return bearer === secret || header === secret;
  }
  // No secret configured: only allow in the dev/testing env.
  return process.env.WHATSAPP_ALLOW_SIMULATE === "1";
}

export const POST = withRoute("cron.whatsapp-reminders", async (request) => {
  if (!authorized(request)) return unauthorized();

  try {
    const checkins = await runCheckinReminders();
    logger.info("whatsapp.reminders_run", checkins);

    const invoices = await runInvoiceReminders(new URL(request.url).origin);
    logger.info("billing.invoice_reminders_run", invoices);

    return NextResponse.json({ checkins, invoices });
  } catch (error) {
    logger.error("whatsapp.reminders_failed", { err: error });
    return apiError("Falha ao enviar lembretes.", 500);
  }
});
