// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-wiring tests for the daily cron entry point. Both scheduled jobs are
 * mocked out — their own behavior is covered by
 * `tests/whatsapp.integration.test.ts` (`runCheckinReminders`) and
 * `tests/billing-reminders.integration.test.ts` (`runInvoiceReminders`). What
 * this file pins is the ROUTE: the shared-secret auth gate, that a single POST
 * drives both jobs, and that both results land in the response body.
 */

const runCheckinReminders = vi.fn(async () => ({
  clinicsProcessed: 1,
  remindersSent: 2,
}));
const runInvoiceReminders = vi.fn<(appUrl: string) => Promise<{
  invoicesProcessed: number;
  whatsappSent: number;
  emailSent: number;
}>>(async () => ({
  invoicesProcessed: 1,
  whatsappSent: 1,
  emailSent: 0,
}));

vi.mock("@/server/whatsapp-automations", () => ({
  runCheckinReminders: () => runCheckinReminders(),
}));
vi.mock("@/server/billing-reminders", () => ({
  runInvoiceReminders: (appUrl: string) => runInvoiceReminders(appUrl),
}));

import * as route from "@/app/api/cron/whatsapp-reminders/route";

const post = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/cron/whatsapp-reminders", {
    method: "POST",
    headers,
  });

const previousSecret = process.env.CRON_SECRET;
const previousSimulate = process.env.WHATSAPP_ALLOW_SIMULATE;

beforeEach(() => {
  runCheckinReminders.mockClear();
  runInvoiceReminders.mockClear();
  delete process.env.CRON_SECRET;
  delete process.env.WHATSAPP_ALLOW_SIMULATE;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
  if (previousSimulate === undefined) delete process.env.WHATSAPP_ALLOW_SIMULATE;
  else process.env.WHATSAPP_ALLOW_SIMULATE = previousSimulate;
});

describe("POST /api/cron/whatsapp-reminders", () => {
  it("refuses with no secret configured and no dev-simulate flag", async () => {
    const res = await route.POST(post(), undefined as never);

    expect(res.status).toBe(401);
    expect(runCheckinReminders).not.toHaveBeenCalled();
    expect(runInvoiceReminders).not.toHaveBeenCalled();
  });

  it("allows the dev-simulate flag when no secret is set", async () => {
    process.env.WHATSAPP_ALLOW_SIMULATE = "1";

    const res = await route.POST(post(), undefined as never);

    expect(res.status).toBe(200);
    expect(runCheckinReminders).toHaveBeenCalledTimes(1);
    expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong bearer token when a secret is configured", async () => {
    process.env.CRON_SECRET = "the-real-secret";

    const res = await route.POST(
      post({ authorization: "Bearer wrong" }),
      undefined as never,
    );

    expect(res.status).toBe(401);
    expect(runInvoiceReminders).not.toHaveBeenCalled();
  });

  it("accepts the bearer token and runs both jobs, merging their results", async () => {
    process.env.CRON_SECRET = "the-real-secret";

    const res = await route.POST(
      post({ authorization: "Bearer the-real-secret" }),
      undefined as never,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      checkins: { clinicsProcessed: 1, remindersSent: 2 },
      invoices: { invoicesProcessed: 1, whatsappSent: 1, emailSent: 0 },
    });
    expect(runCheckinReminders).toHaveBeenCalledTimes(1);
    // The invoice job gets the request's own origin (no explicit APP_URL
    // input), so the "Assinar" link it builds resolves back to this deploy.
    expect(runInvoiceReminders).toHaveBeenCalledWith("http://localhost");
  });

  it("also accepts the x-cron-secret header", async () => {
    process.env.CRON_SECRET = "the-real-secret";

    const res = await route.POST(
      post({ "x-cron-secret": "the-real-secret" }),
      undefined as never,
    );

    expect(res.status).toBe(200);
    expect(runInvoiceReminders).toHaveBeenCalledTimes(1);
  });

  it("answers 500 without leaking details when a job throws", async () => {
    process.env.CRON_SECRET = "the-real-secret";
    runInvoiceReminders.mockRejectedValueOnce(new Error("boom"));

    const res = await route.POST(
      post({ authorization: "Bearer the-real-secret" }),
      undefined as never,
    );

    expect(res.status).toBe(500);
  });
});
