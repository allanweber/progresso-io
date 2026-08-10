import { NextResponse } from "next/server";

import { db } from "@/db";
import { admin } from "@/server/dal";
import { forbidden } from "@/server/api";
import { withRoute } from "@/server/observability";
import { getAdminSession } from "@/server/admin";

/**
 * Clinics for the super admin. Returns each clinic enriched with its owner and
 * coach/student counts (the "Clínicas" manager payload); the various admin
 * screens' clinic filters read just the id + name off the same list. Admin-only,
 * cross-tenant.
 */
export const GET = withRoute("admin.clinics.list", async () => {
  const session = await getAdminSession();
  if (!session) return forbidden();

  const clinics = await admin.listAllClinics(db);
  return NextResponse.json({ clinics });
});
