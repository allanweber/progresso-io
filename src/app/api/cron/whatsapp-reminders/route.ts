import { NextResponse } from "next/server";

import { runCheckinReminders } from "@/server/whatsapp-automations";
import { apiError, unauthorized } from "@/server/api";
import { logger, withRoute } from "@/server/observability";

/**
 * Daily cron entry point for the scheduled check-in reminder. Cross-tenant and
 * session-less: it walks every clinic whose preferred check-in weekday is today
 * and messages each due student through the same template resolver the coach
 * composer uses (see `runCheckinReminders`).
 *
 * Auth is a shared secret, never a user session: the caller must present
 * `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret: $CRON_SECRET`). If
 * `CRON_SECRET` is unset the route only runs under the dev-simulate flag
 * (`WHATSAPP_ALLOW_SIMULATE=1`) so it stays triggerable in the testing env; in
 * production with no secret configured it refuses. Idempotent within a cadence
 * period, so a double-fire won't double-message.
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
    const result = await runCheckinReminders();
    logger.info("whatsapp.reminders_run", result);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("whatsapp.reminders_failed", { err: error });
    return apiError("Falha ao enviar lembretes.", 500);
  }
});
