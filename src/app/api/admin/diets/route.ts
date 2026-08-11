import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  adminTemplateListQuerySchema,
  type AdminTemplateListResponse,
} from "@/lib/admin";
import { admin } from "@/server/dal";
import { forbidden, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Cross-clinic diets listing for the admin "Manutenção → Dietas" tab. Every
 * clinic's diets, tagged Sistema (source_key set) / Clínica, with how many
 * student diets were created from each. Admin-only; filters validated with zod.
 */
export const GET = withRoute("admin.diets.list", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = adminTemplateListQuerySchema.safeParse({
    clinic: p.get("clinic") || undefined,
    origin: p.get("origin") || undefined,
    search: p.get("search") || undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await admin.listDietsAcrossClinics(db, {
    clinicId: q.clinic,
    origin: q.origin,
    search: q.search,
    page: q.page,
    pageSize: q.pageSize,
  });

  const body: AdminTemplateListResponse = {
    items: result.items.map((r) => ({
      id: r.id,
      name: r.name,
      clinicId: r.clinicId,
      clinicName: r.clinicName,
      origin: r.origin,
      sourceKey: r.sourceKey,
      archived: r.archived,
      updatedAt: r.updatedAt.toISOString(),
      studentUsageCount: r.studentUsageCount,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
  return NextResponse.json(body);
});
