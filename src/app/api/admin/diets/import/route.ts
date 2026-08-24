import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminImportStartersSchema, type AdminImportResult } from "@/lib/admin";
import { starters } from "@/server/dal";
import { apiError, readJson, validationError } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Imports selected system diet starters into one clinic (idempotent by
 * source_key — starters the clinic already has are skipped). Admin-only.
 */
export const POST = withAdmin("admin.diets.import", async (request) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = adminImportStartersSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await starters.importDietStartersToClinic(
    db,
    parsed.data.clinicId,
    parsed.data.keys,
  );
  if (!result.ok) {
    if (result.reason === "clinic_not_found") {
      return apiError("Clínica não encontrada.", 404);
    }
    return apiError("Nenhuma dieta válida selecionada.", 422);
  }

  logger.info("admin.diets_imported", {
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
