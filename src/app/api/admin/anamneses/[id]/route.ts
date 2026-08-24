import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Hard-deletes any clinic's anamnese (admin data maintenance). Students filled
 * from it keep their snapshot — only `student_anamnesis.source_anamnesis_id`
 * nulls (FK ON DELETE SET NULL). Admin-only, cross-tenant.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withAdmin<Params>(
  "admin.anamneses.delete",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const ok = await admin.hardDeleteAnamnesis(db, id);
    if (!ok) return notFound("Anamnese não encontrada.");
    logger.info("admin.anamnesis_deleted", { anamnesisId: id });
    return NextResponse.json({ ok: true });
  },
);
