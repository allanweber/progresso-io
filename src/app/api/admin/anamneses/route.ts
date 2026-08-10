import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  adminAnamnesisListQuerySchema,
  type AdminAnamnesisListResponse,
} from "@/lib/admin";
import { admin } from "@/server/dal";
import { forbidden, validationError } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Cross-clinic anamneses listing for the admin "Manutenção → Anamneses" tab.
 * Every clinic's anamneses, tagged Sistema (source_key set) / Clínica, with the
 * student-usage count. Admin-only; filters validated with zod.
 */
export const GET = withRoute("admin.anamneses.list", async (request) => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const p = new URL(request.url).searchParams;
  const parsed = adminAnamnesisListQuerySchema.safeParse({
    clinic: p.get("clinic") || undefined,
    origin: p.get("origin") || undefined,
    search: p.get("search") || undefined,
    page: p.get("page") || undefined,
    pageSize: p.get("pageSize") || undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  const q = parsed.data;

  const result = await admin.listAnamnesesAcrossClinics(db, {
    clinicId: q.clinic,
    origin: q.origin,
    search: q.search,
    page: q.page,
    pageSize: q.pageSize,
  });

  const body: AdminAnamnesisListResponse = {
    items: result.items.map((r) => ({
      id: r.id,
      name: r.name,
      clinicId: r.clinicId,
      clinicName: r.clinicName,
      origin: r.sourceKey ? "system" : "clinic",
      sourceKey: r.sourceKey,
      objective: r.objective,
      modality: r.modality,
      updatedAt: r.updatedAt.toISOString(),
      studentUsageCount: r.studentUsageCount,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
  return NextResponse.json(body);
});
