import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { isUuid, notFound } from "@/server/api";
import { logger } from "@/server/observability";
import { withAdmin } from "@/server/guard";

/**
 * Hard-deletes any clinic's diet (admin data maintenance). Student diets created
 * from it keep their own versioned copy — only `student_diet.source_diet_id`
 * nulls (FK ON DELETE SET NULL). Admin-only, cross-tenant.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withAdmin<Params>(
  "admin.diets.delete",
  async (_request, _session, { params }) => {
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const ok = await admin.hardDeleteDiet(db, id);
    if (!ok) return notFound("Dieta não encontrada.");
    logger.info("admin.diet_deleted", { dietId: id });
    return NextResponse.json({ ok: true });
  },
);
