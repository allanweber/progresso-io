import { NextResponse } from "next/server";

import { db } from "@/db";
import { aiSettingsSchema } from "@/lib/ai-settings";
import { aiSettings } from "@/server/dal";
import { forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Which model drafts programs. Platform reference data, so admin-only and
 * cross-tenant (`getAdminSession`, not a TenantContext) — same posture as the
 * price list next door.
 *
 * There is no GET: the settings ride along on the `/api/admin/ai` overview,
 * which the screen already loads, and a second source for the same value is a
 * second thing to keep in step.
 *
 * The change takes effect on the **next generation**, with no restart: the
 * provider reads these on every call. That is the whole reason they are a row.
 */
export const PUT = withRoute("admin.ai.settings.update", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = aiSettingsSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const settings = await aiSettings.updateAiSettings(db, parsed.data);
  // Worth a log line of its own: it is the one change that silently alters what
  // every clinic's generations cost, and the audit rows only show the effect.
  logger.info("admin.ai.settings.updated", {
    model: settings.model,
    fallbackModels: settings.fallbackModels,
  });
  return NextResponse.json({ settings });
});
