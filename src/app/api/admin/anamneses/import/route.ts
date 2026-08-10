import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  adminImportStartersSchema,
  type AdminImportResult,
} from "@/lib/admin";
import { admin } from "@/server/dal";
import { apiError, forbidden, readJson, validationError } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Imports selected system starters into one clinic (idempotent by source_key —
 * starters the clinic already has are skipped). Admin-only.
 */
export const POST = withRoute("admin.anamneses.import", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = adminImportStartersSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await admin.importStartersToClinic(
    db,
    parsed.data.clinicId,
    parsed.data.keys,
  );
  if (!result.ok) {
    if (result.reason === "clinic_not_found") {
      return apiError("Clínica não encontrada.", 404);
    }
    return apiError("Nenhuma anamnese válida selecionada.", 422);
  }

  logger.info("admin.anamneses_imported", {
    clinicId: parsed.data.clinicId,
    imported: result.imported.length,
    skipped: result.skipped.length,
  });
  const body_: AdminImportResult = { imported: result.imported, skipped: result.skipped };
  return NextResponse.json(body_);
});
