import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminImportStartersSchema, type AdminImportResult } from "@/lib/admin";
import { starters } from "@/server/dal";
import { apiError, forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Imports selected system workout starters into one clinic (idempotent by
 * source_key — starters the clinic already has are skipped). Admin-only.
 */
export const POST = withRoute("admin.workouts.import", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = adminImportStartersSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await starters.importWorkoutStartersToClinic(
    db,
    parsed.data.clinicId,
    parsed.data.keys,
  );
  if (!result.ok) {
    if (result.reason === "clinic_not_found") {
      return apiError("Clínica não encontrada.", 404);
    }
    return apiError("Nenhum treino válido selecionado.", 422);
  }

  logger.info("admin.workouts_imported", {
    clinicId: parsed.data.clinicId,
    imported: result.imported.length,
    skipped: result.skipped.length,
  });
  const out: AdminImportResult = {
    imported: result.imported,
    skipped: result.skipped,
  };
  return NextResponse.json(out);
});
