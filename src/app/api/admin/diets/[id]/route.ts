import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden, isUuid, notFound } from "@/server/api";
import { logger, withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Hard-deletes any clinic's diet (admin data maintenance). Student diets created
 * from it keep their own versioned copy — only `student_diet.source_diet_id`
 * nulls (FK ON DELETE SET NULL). Admin-only, cross-tenant.
 */
type Params = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Params>(
  "admin.diets.delete",
  async (_request, { params }) => {
    const session = await getAdminSession();
    if (!session) return forbidden();
    const { id } = await params;
    if (!isUuid(id)) return notFound();

    const ok = await admin.hardDeleteDiet(db, id);
    if (!ok) return notFound("Dieta não encontrada.");
    logger.info("admin.diet_deleted", { dietId: id });
    return NextResponse.json({ ok: true });
  },
);
